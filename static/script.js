let patient = null
let avatarRequestId = 0

async function fetchNewPatient() {
  document.getElementById('final').classList.add('hidden')
  document.getElementById('message').textContent = ''

  const res = await fetch('/new_patient')
  const data = await res.json()
  if (data.game_over) {
    showFinal(data.final)
    return
  }
  patient = data.patient
  renderPatient(patient)
  renderState(data.state)
}

function renderAvatarPlaceholder() {
  const avatar = document.getElementById('avatar')
  avatar.innerHTML = ''
  avatar.textContent = ''
  const placeholder = document.createElement('div')
  placeholder.className = 'avatar-fallback'
  avatar.appendChild(placeholder)
}

async function loadAvatar(age) {
  const requestId = ++avatarRequestId
  renderAvatarPlaceholder()
  try {
    const res = await fetch(`/avatar?age=${encodeURIComponent(age)}&t=${Date.now()}`)
    const data = await res.json()
    if (requestId !== avatarRequestId) {
      return
    }
    if (data && data.url) {
      const avatar = document.getElementById('avatar')
      avatar.innerHTML = ''
      const img = document.createElement('img')
      img.src = data.url
      img.alt = 'Patient avatar'
      img.className = 'avatar-img'
      avatar.appendChild(img)
    }
  } catch (e) {
    // Keep placeholder on failure
  }
}

function renderPatient(p) {
  document.getElementById('age').textContent = p.age
  document.getElementById('symptoms').textContent = p.symptoms.join(', ')
  document.getElementById('exposure').textContent = p.exposure ? 'Yes' : 'No'
  document.getElementById('comorbidity').textContent = p.comorbidity
  document.getElementById('message').textContent = ''

  const risk = p.risk || 'Low'
  const badge = document.getElementById('risk-badge')
  badge.className = `badge ${risk.toLowerCase()}`
  badge.textContent = risk

  loadAvatar(p.age)
}

function renderState(s) {
  document.getElementById('day').textContent = s.day
  document.getElementById('beds').textContent = `${s.available_beds} / ${s.total_beds}`
  document.getElementById('treated').textContent = s.patients_treated
  document.getElementById('deaths').textContent = s.deaths
  document.getElementById('recovered').textContent = s.recovered
  document.getElementById('staff').textContent = s.infected_staff
  document.getElementById('trust').textContent = s.public_trust
  const bedsPct = Math.round((s.available_beds / s.total_beds) * 100)
  document.getElementById('beds-bar').style.width = `${bedsPct}%`
  document.getElementById('trust-bar').style.width = `${s.public_trust}%`
}

async function sendDecision(action) {
  const res = await fetch('/decision', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action})
  })
  const data = await res.json()
  if (data.game_over) {
    showFinal(data.final)
    return
  }
  document.getElementById('message').textContent = data.message || ''
  renderState(data.state)
  patient = data.patient
  setTimeout(() => renderPatient(patient), 600)
}

function showFinal(final) {
  const el = document.getElementById('final')
  const stats = document.getElementById('final-stats')
  stats.innerHTML = `
    <p><strong>Rating:</strong> ${final.rating}</p>
    <p>${final.narrative}</p>
    <p>Days: ${final.day}</p>
    <p>Recovered: ${final.recovered} - Deaths: ${final.deaths}</p>
    <p>Infected staff: ${final.infected_staff}</p>
    <p>Public trust: ${final.public_trust}%</p>
  `
  el.classList.remove('hidden')
}

async function downloadFinal(format) {
  try {
    const url = `/export?format=${encodeURIComponent(format)}`
    const a = document.createElement('a')
    a.href = url
    a.download = format === 'json'
      ? 'triage-summary.json'
      : (format === 'csv' ? 'triage-summary.csv' : 'triage-summary.xlsx')
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (e) {
    alert('Unable to download report.')
  }
}

function resetClientState() {
  patient = null
  document.getElementById('message').textContent = ''
}

function bindRestart(button) {
  button.addEventListener('click', (e) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    button.disabled = true
    fetch('/restart', {method: 'POST'})
      .then(() => {
        resetClientState()
        return fetchNewPatient()
      })
      .finally(() => { button.disabled = false })
  })
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admit').addEventListener('click', () => sendDecision('Admit'))
  document.getElementById('discharge').addEventListener('click', () => sendDecision('Discharge'))
  document.getElementById('isolate').addEventListener('click', () => sendDecision('Isolate'))
  document.getElementById('export-json').addEventListener('click', () => downloadFinal('json'))
  document.getElementById('export-csv').addEventListener('click', () => downloadFinal('csv'))

  bindRestart(document.getElementById('restart-mid'))
  bindRestart(document.getElementById('restart'))

  fetchNewPatient()
})
