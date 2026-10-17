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
  // The outcome message of the last decision stays visible until the next decision

  const risk = p.risk || 'Low'
  const badge = document.getElementById('risk-badge')
  badge.className = `badge ${risk.toLowerCase()}`
  badge.textContent = `${risk} risk`

  loadAvatar(p.age)
  announcePatient()
}

// Short fade-in so the user notices a new patient has arrived (skipped if reduced motion is on)
function announcePatient() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  document.getElementById('patient-info').animate(
    [{opacity: 0, transform: 'translateY(6px)'}, {opacity: 1, transform: 'translateY(0)'}],
    {duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)'}
  )
}

function setDecisionButtonsDisabled(disabled) {
  ['admit', 'discharge', 'isolate'].forEach((id) => {
    document.getElementById(id).disabled = disabled
  })
}

function renderState(s) {
  document.getElementById('day').textContent = s.day
  document.getElementById('beds').textContent = `${s.available_beds} / ${s.total_beds}`
  document.getElementById('treated').textContent = s.patients_treated
  document.getElementById('deaths').textContent = s.deaths
  document.getElementById('recovered').textContent = s.recovered
  document.getElementById('staff').textContent = s.infected_staff
  document.getElementById('trust').textContent = s.public_trust
  // Bars use scaleX (transform) instead of width so the animation stays smooth
  const bedsRatio = s.available_beds / s.total_beds
  document.getElementById('beds-bar').style.transform = `scaleX(${bedsRatio})`
  document.getElementById('trust-bar').style.transform = `scaleX(${s.public_trust / 100})`
}

async function sendDecision(action) {
  setDecisionButtonsDisabled(true)
  try {
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
    // Give the user a moment to read the outcome before the next patient appears
    setTimeout(() => {
      renderPatient(patient)
      setDecisionButtonsDisabled(false)
    }, 600)
  } catch (e) {
    setDecisionButtonsDisabled(false)
  }
}

function showFinal(final) {
  const el = document.getElementById('final')
  const stats = document.getElementById('final-stats')
  stats.innerHTML = `
    <span class="final-rating">${final.rating}</span>
    <p class="final-narrative">${final.narrative}</p>
    <div class="final-grid">
      <div><span>Days survived</span><strong>${final.day}</strong></div>
      <div><span>Public trust</span><strong>${final.public_trust}%</strong></div>
      <div><span>Recovered</span><strong>${final.recovered}</strong></div>
      <div><span>Deaths</span><strong>${final.deaths}</strong></div>
      <div><span>Staff infected</span><strong>${final.infected_staff}</strong></div>
    </div>
  `
  setDecisionButtonsDisabled(false)
  el.classList.remove('hidden')
}

async function downloadFinal(format) {
  try {
    const url = `/export?format=${encodeURIComponent(format)}`
    const a = document.createElement('a')
    a.href = url
    a.download = format === 'json' ? 'triage-summary.json' : 'triage-summary.csv'
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
