import os
import random
import re
import time
import urllib.error
import urllib.request
from urllib.parse import quote
from uuid import uuid4

from flask import Flask, Response, jsonify, render_template, request, session

app = Flask(__name__)
app.secret_key = "change-this-secret-for-production"

# In-memory store for game states keyed by session id
GAMES = {}

SYMPTOMS = ["fever", "cough", "breathlessness", "fatigue", "none"]
COMORBIDITIES = ["none", "diabetes", "asthma", "heart disease"]
DAY_LIMIT = 15
AVATAR_CACHE_TTL = 3600
AVATAR_CACHE = {"urls": [], "ts": 0}
AVATAR_FOLDERS = {
    "child": "static/avatars/child",
    "youth": "static/avatars/youth",
    "adult": "static/avatars/adult",
    "senior": "static/avatars/senior",
}


class Patient:
    def __init__(self):
        self.age = random.randint(1, 90)
        choices = random.sample(SYMPTOMS, k=random.randint(1, 2))
        if "none" in choices and len(choices) > 1:
            choices.remove("none")
        self.symptoms = choices
        self.exposure = random.choice([True, False])
        self.comorbidity = random.choice(COMORBIDITIES)
        self.severity_score = self.calculate_score()

    def calculate_score(self):
        score = 0
        if self.age > 60:
            score += 2
        if "fever" in self.symptoms:
            score += 1
        if "breathlessness" in self.symptoms:
            score += 3
        if self.exposure:
            score += 2
        if self.comorbidity != "none":
            score += 1
        return score

    def risk_level(self):
        s = self.severity_score
        if s <= 2:
            return "Low"
        if 3 <= s <= 4:
            return "Medium"
        return "High"

    def to_public(self):
        return {
            "age": self.age,
            "symptoms": self.symptoms,
            "exposure": self.exposure,
            "comorbidity": self.comorbidity,
            "risk": self.risk_level(),
        }


class Hospital:
    def __init__(self, total_beds=10):
        self.total_beds = total_beds
        self.inpatients = []
        self.patients_treated = 0
        self.deaths = 0
        self.recovered = 0
        self.infected_staff = 0
        self.public_trust = 100

    @property
    def beds_available(self):
        return max(0, self.total_beds - len(self.inpatients))

    def day_tick(self):
        finished = []
        for p in self.inpatients:
            p["days_remaining"] -= 1
            if p["days_remaining"] <= 0:
                finished.append(p)
        for p in finished:
            try:
                self.inpatients.remove(p)
            except ValueError:
                pass
            self.recovered += 1
            self.patients_treated += 1


class GameController:
    def __init__(self):
        self.hospital = Hospital()
        self.day = 1
        self.current_patient = None
        self.game_over = False
        self.history = []
        self.record_state()

    def snapshot(self):
        h = self.hospital
        return {
            "available_beds": h.beds_available,
            "total_beds": h.total_beds,
            "day": self.day,
            "patients_treated": h.patients_treated,
            "deaths": h.deaths,
            "recovered": h.recovered,
            "infected_staff": h.infected_staff,
            "public_trust": h.public_trust,
        }

    def record_state(self):
        snapshot = self.snapshot()
        if not self.history or self.history[-1]["day"] != snapshot["day"]:
            self.history.append(snapshot)

    def generate_patient(self):
        p = Patient()
        self.current_patient = p
        return p

    def process_decision(self, action):
        p = self.current_patient
        if p is None:
            return "No patient"
        risk = p.risk_level()
        msg = ""

        if action == "Admit":
            if self.hospital.beds_available > 0:
                stay = random.randint(1, 3)
                self.hospital.inpatients.append({"days_remaining": stay, "risk": risk})
                msg = f"Patient admitted for {stay} day(s)."
                if risk == "High":
                    self.hospital.infected_staff += 1
            else:
                if risk == "High":
                    self.hospital.deaths += 1
                    self.hospital.public_trust -= 15
                    self.hospital.infected_staff += 1
                    msg = "No beds available - high-risk patient died after being turned away."
                elif risk == "Medium":
                    self.hospital.deaths += 1
                    self.hospital.public_trust -= 10
                    msg = "No beds - medium-risk patient died after being turned away."
                else:
                    self.hospital.public_trust -= 5
                    self.hospital.recovered += 1
                    self.hospital.patients_treated += 1
                    msg = "No beds - low-risk patient discharged safely but trust dipped."

        elif action == "Discharge":
            if risk == "Low":
                self.hospital.recovered += 1
                self.hospital.public_trust = min(100, self.hospital.public_trust + 1)
                msg = "Patient discharged safely."
            elif risk == "Medium":
                self.hospital.recovered += 1
                self.hospital.infected_staff += 1
                self.hospital.public_trust -= 5
                msg = "Patient discharged - managed but caused staff strain."
            else:
                self.hospital.deaths += 1
                self.hospital.public_trust -= 20
                self.hospital.infected_staff += 2
                msg = "High-risk patient discharged and died - significant consequences."
            self.hospital.patients_treated += 1

        elif action == "Isolate":
            if risk == "High":
                self.hospital.recovered += 1
                self.hospital.public_trust = min(100, self.hospital.public_trust + 2)
                msg = "High-risk patient isolated and treated successfully."
            elif risk == "Medium":
                self.hospital.recovered += 1
                self.hospital.public_trust = min(100, self.hospital.public_trust + 1)
                msg = "Patient isolated; outcome stable."
            else:
                self.hospital.recovered += 1
                self.hospital.public_trust = min(100, self.hospital.public_trust + 1)
                msg = "Low-risk patient isolated (conservative), public felt reassured."
            self.hospital.patients_treated += 1

        self.day += 1
        self.hospital.day_tick()
        self.hospital.public_trust = max(0, min(100, self.hospital.public_trust))
        if (
            self.hospital.beds_available == 0
            or self.hospital.public_trust == 0
            or self.day > DAY_LIMIT
        ):
            self.game_over = True
        self.record_state()
        return msg


def get_game():
    gid = session.get("game_id")
    if not gid or gid not in GAMES:
        gid = str(uuid4())
        session["game_id"] = gid
        GAMES[gid] = GameController()
    return GAMES[gid]


def fetch_uifaces_cartoon_urls():
    try:
        req = urllib.request.Request(
            "https://uifaces.co/category/cartoon",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError):
        return []

    urls = re.findall(r"https://images\.uifaces\.co/[^\"\'\s]+", html)
    seen = set()
    cleaned = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            cleaned.append(url)
    return cleaned


def generate_svg_avatar():
    skin_tones = ["#f5c7a9", "#e6b089", "#d59b6e", "#c4885c", "#b4764d"]
    hair_tones = ["#2b1d0e", "#4b2e19", "#7a4a1f", "#1b1b1b", "#5a3a2a"]
    bg_palette = [
        ("#18c4d6", "#0b7aa5"),
        ("#ffb300", "#fb8c00"),
        ("#7e57c2", "#4527a0"),
        ("#43a047", "#1b5e20"),
        ("#1e88e5", "#0d47a1"),
    ]
    bg1, bg2 = random.choice(bg_palette)
    skin = random.choice(skin_tones)
    hair = random.choice(hair_tones)
    shirt = random.choice(
        ["#e3f2fd", "#e8f5e9", "#fff3e0", "#f3e5f5", "#e0f7fa"]
    )
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='{bg1}'/>
        <stop offset='1' stop-color='{bg2}'/>
      </linearGradient>
      <radialGradient id='face' cx='50%' cy='40%' r='60%'>
        <stop offset='0' stop-color='#ffffff' stop-opacity='0.45'/>
        <stop offset='1' stop-color='{skin}'/>
      </radialGradient>
    </defs>
    <rect x='6' y='6' width='148' height='148' rx='28' fill='url(#bg)'/>
    <rect x='14' y='14' width='132' height='132' rx='24' fill='rgba(255,255,255,0.08)'/>
    <ellipse cx='80' cy='118' rx='52' ry='26' fill='{shirt}' opacity='0.9'/>
    <ellipse cx='80' cy='128' rx='64' ry='30' fill='rgba(0,0,0,0.18)'/>
    <circle cx='80' cy='76' r='36' fill='url(#face)'/>
    <path d='M40 68 C46 40, 114 40, 120 68' fill='{hair}'/>
    <path d='M46 70 C54 52, 106 52, 114 70' fill='{hair}' opacity='0.85'/>
    <circle cx='66' cy='76' r='5' fill='#2b2b2b'/>
    <circle cx='94' cy='76' r='5' fill='#2b2b2b'/>
    <rect x='68' y='92' width='24' height='10' rx='5' fill='#2b2b2b' opacity='0.7'/>
    <circle cx='68' cy='74' r='2' fill='#ffffff' opacity='0.6'/>
    <circle cx='96' cy='74' r='2' fill='#ffffff' opacity='0.6'/>
    </svg>"""
    return "data:image/svg+xml;utf8," + quote(svg)


def get_local_avatar_for_age(age):
    if age <= 15:
        folder = AVATAR_FOLDERS["child"]
    elif age <= 40:
        folder = AVATAR_FOLDERS["youth"]
    elif age <= 60:
        folder = AVATAR_FOLDERS["adult"]
    else:
        folder = AVATAR_FOLDERS["senior"]

    if not os.path.isdir(folder):
        return None
    files = [
        f
        for f in os.listdir(folder)
        if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
    ]
    if not files:
        return None
    pick = random.choice(files)
    return "/" + folder.replace("\\", "/").lstrip("/") + "/" + pick


def get_avatar_url(age=None):
    if age is not None:
        local_url = get_local_avatar_for_age(age)
        if local_url:
            return local_url
    now = time.time()
    if not AVATAR_CACHE["urls"] or (now - AVATAR_CACHE["ts"]) > AVATAR_CACHE_TTL:
        AVATAR_CACHE["urls"] = fetch_uifaces_cartoon_urls()
        AVATAR_CACHE["ts"] = now
    if AVATAR_CACHE["urls"]:
        return random.choice(AVATAR_CACHE["urls"])
    return generate_svg_avatar()


def serialize_state(game: GameController):
    return game.snapshot()


def game_summary(game: GameController):
    s = serialize_state(game)
    score = s["recovered"] - s["deaths"] - s["infected_staff"]
    if score > 10:
        rating = "Hero"
        narrative = "You managed scarce resources wisely and saved many lives."
    elif score > 0:
        rating = "Mixed"
        narrative = "You made tough calls - some good outcomes, some losses."
    else:
        rating = "Disaster"
        narrative = "Resource strain and poor outcomes undermined public trust."
    s.update({"rating": rating, "narrative": narrative})
    return s


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/guide")
def guide():
    return render_template("guide.html")


@app.route("/analytics")
def analytics():
    return render_template("analytics.html")


@app.route("/new_patient")
def new_patient():
    game = get_game()
    if game.game_over:
        return jsonify({"game_over": True, "final": game_summary(game)})
    patient = game.generate_patient()
    return jsonify({"patient": patient.to_public(), "state": serialize_state(game), "game_over": False})


@app.route("/decision", methods=["POST"])
def decision():
    data = request.get_json() or {}
    action = data.get("action")
    game = get_game()
    if game.game_over:
        return jsonify({"game_over": True, "final": game_summary(game)})
    msg = game.process_decision(action)
    if game.game_over:
        return jsonify({"game_over": True, "final": game_summary(game), "message": msg})
    patient = game.generate_patient()
    return jsonify(
        {
            "game_over": False,
            "message": msg,
            "patient": patient.to_public(),
            "state": serialize_state(game),
        }
    )


@app.route("/avatar")
def avatar():
    age = request.args.get("age", type=int)
    return jsonify({"url": get_avatar_url(age)})


@app.route("/restart", methods=["POST"])
def restart():
    gid = session.get("game_id")
    if gid and gid in GAMES:
        del GAMES[gid]
    new_id = str(uuid4())
    session["game_id"] = new_id
    GAMES[new_id] = GameController()
    return jsonify({"ok": True})


@app.route("/export")
def export():
    """Return the current game summary in JSON, CSV, or Excel-friendly CSV."""
    game = get_game()
    summary = game_summary(game)
    fmt = (request.args.get("format") or "json").lower()

    if fmt in {"csv", "xlsx"}:
        headers = [
            "rating",
            "narrative",
            "day",
            "available_beds",
            "total_beds",
            "patients_treated",
            "deaths",
            "recovered",
            "infected_staff",
            "public_trust",
        ]
        values = [str(summary.get(h, "")) for h in headers]
        csv_body = ",".join(headers) + "\n" + ",".join(values) + "\n"
        filename = "triage-summary.csv" if fmt == "csv" else "triage-summary.xlsx"
        content_type = "text/csv" if fmt == "csv" else "application/vnd.ms-excel"
        return Response(
            csv_body,
            mimetype=content_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    if fmt == "json":
        json_body = jsonify({"summary": summary}).get_data(as_text=True)
        return Response(
            json_body,
            mimetype="application/json",
            headers={"Content-Disposition": "attachment; filename=triage-summary.json"},
        )

    return jsonify({"summary": summary})


@app.route("/analytics_data")
def analytics_data():
    game = get_game()
    return jsonify({"history": game.history, "summary": game_summary(game)})


if __name__ == "__main__":
    app.run(debug=True)
