function drawLineChart(canvas, labels, values, opts){
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const padding = 54
  const maxVal = Math.max(...values, 1)
  const minVal = Math.min(...values, 0)
  const range = Math.max(1, maxVal - minVal)

  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  for(let i = 0; i < 5; i++){
    const y = padding + ((h - padding * 2) / 4) * i
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(w - padding, y)
    ctx.stroke()
  }

  const stepX = (w - padding * 2) / Math.max(1, values.length - 1)
  ctx.strokeStyle = opts.color
  ctx.lineWidth = 3
  ctx.beginPath()
  values.forEach((val, i) => {
    const x = padding + i * stepX
    const y = h - padding - ((val - minVal) / range) * (h - padding * 2)
    if(i === 0){
      ctx.moveTo(x, y)
    }else{
      ctx.lineTo(x, y)
    }
  })
  ctx.stroke()

  ctx.fillStyle = opts.color
  values.forEach((val, i) => {
    const x = padding + i * stepX
    const y = h - padding - ((val - minVal) / range) * (h - padding * 2)
    ctx.beginPath()
    ctx.arc(x, y, 3.5, 0, Math.PI * 2)
    ctx.fill()
  })

  ctx.fillStyle = '#9aa7b2'
  ctx.font = '12px Segoe UI'
  labels.forEach((label, i) => {
    if(i % 2 === 0 || labels.length <= 6){
      const x = padding + i * stepX
      const y = h - 14
      ctx.save()
      ctx.translate(x - 6, y)
      ctx.rotate(-Math.PI / 8)
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  })
}

function drawBarChart(canvas, labels, values, opts){
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  const padding = 68
  const maxVal = Math.max(...values, 1)
  const barGap = 28
  const barWidth = (w - padding * 2 - barGap * (values.length - 1)) / values.length

  values.forEach((val, i) => {
    const x = padding + i * (barWidth + barGap)
    const barHeight = ((val / maxVal) * (h - padding * 2))
    const y = h - padding - barHeight
    ctx.fillStyle = opts.colors[i] || opts.color
    ctx.fillRect(x, y, barWidth, barHeight)
    ctx.fillStyle = '#cfe3ea'
    ctx.font = '600 14px Segoe UI'
    const labelWidth = ctx.measureText(labels[i]).width
    const labelX = x + (barWidth / 2) - (labelWidth / 2)
    const labelY = h - 20
    ctx.fillText(labels[i], labelX, labelY)
  })
}

function updateMetrics(summary){
  const treated = Math.max(1, summary.patients_treated || 0)
  const survivalRate = Math.round(((summary.recovered || 0) / treated) * 100)
  const staffImpact = Math.round(((summary.infected_staff || 0) / treated) * 100)
  const trust = summary.public_trust || 0

  document.getElementById('metric-survival').textContent = `${survivalRate}%`
  document.getElementById('metric-survival-sub').textContent = `${summary.recovered} recovered / ${summary.patients_treated} treated`
  document.getElementById('metric-staff').textContent = `${staffImpact}%`
  document.getElementById('metric-staff-sub').textContent = `${summary.infected_staff} staff infections`
  document.getElementById('metric-trust').textContent = `${trust}%`
  document.getElementById('metric-trust-sub').textContent = `${summary.rating} outlook`
  const utilization = Math.round(((summary.total_beds - summary.available_beds) / summary.total_beds) * 100)
  document.getElementById('metric-beds').textContent = `${utilization}%`
  document.getElementById('metric-beds-sub').textContent = `${summary.total_beds - summary.available_beds} of ${summary.total_beds} occupied`
}

async function fetchAnalytics(){
  const res = await fetch('/analytics_data')
  const data = await res.json()
  const history = data.history || []
  const labels = history.map(h => `D${h.day}`)
  const trust = history.map(h => h.public_trust)
  const bedsUsed = history.map(h => h.total_beds - h.available_beds)
  const outcomes = [
    data.summary.recovered || 0,
    data.summary.deaths || 0,
    data.summary.infected_staff || 0
  ]

  updateMetrics(data.summary)
  drawLineChart(document.getElementById('chart-trust'), labels, trust, {color:'#00bcd4'})
  drawLineChart(document.getElementById('chart-beds'), labels, bedsUsed, {color:'#ffb74d'})
  drawBarChart(document.getElementById('chart-outcomes'), ['Recovered', 'Deaths', 'Staff'], outcomes, {color:'#4caf50', colors:['#4caf50','#e53935','#ffb74d']})
}

function bindExport(){
  const btnJson = document.getElementById('export-json')
  const btnCsv = document.getElementById('export-csv')
  const download = (format) => {
    const a = document.createElement('a')
    a.href = `/export?format=${encodeURIComponent(format)}`
    a.download = format === 'json' ? 'triage-summary.json' : 'triage-summary.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  btnJson.addEventListener('click', ()=>download('json'))
  btnCsv.addEventListener('click', ()=>download('csv'))
}

document.addEventListener('DOMContentLoaded', ()=>{
  bindExport()
  fetchAnalytics()
})
