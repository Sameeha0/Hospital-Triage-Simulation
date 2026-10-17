function drawLineChart(canvas, labels, values, opts){
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const padding = 54
  const minVal = Math.min(...values, 0)
  // keep at least 4 units on the axis so gridline labels are whole, distinct numbers
  const range = Math.max(4, Math.max(...values, 1) - minVal)
  const maxVal = minVal + range

  ctx.strokeStyle = 'rgba(148,184,214,0.12)'
  ctx.lineWidth = 1
  ctx.fillStyle = '#64778c'
  ctx.font = '500 18px Inter, system-ui, sans-serif'
  for(let i = 0; i < 5; i++){
    const y = padding + ((h - padding * 2) / 4) * i
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(w - padding, y)
    ctx.stroke()
    // value label for each gridline
    const value = Math.round(maxVal - (range / 4) * i)
    ctx.fillText(String(value), 8, y + 6)
  }

  const stepX = (w - padding * 2) / Math.max(1, values.length - 1)
  ctx.strokeStyle = opts.color
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
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
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
  })

  ctx.fillStyle = '#93a4b8'
  ctx.font = '500 18px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  labels.forEach((label, i) => {
    if(i % 2 === 0 || labels.length <= 8){
      const x = padding + i * stepX
      ctx.fillText(label, x, h - 16)
    }
  })
  ctx.textAlign = 'left'
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
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, barWidth, barHeight, [10, 10, 0, 0])
    else ctx.rect(x, y, barWidth, barHeight)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.fillStyle = '#e7eef6'
    ctx.font = '700 22px Inter, system-ui, sans-serif'
    ctx.fillText(String(val), x + barWidth / 2, y - 12)
    ctx.fillStyle = '#93a4b8'
    ctx.font = '600 18px Inter, system-ui, sans-serif'
    ctx.fillText(labels[i], x + barWidth / 2, h - 22)
    ctx.textAlign = 'left'
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
  drawLineChart(document.getElementById('chart-trust'), labels, trust, {color:'#22c3d6'})
  drawLineChart(document.getElementById('chart-beds'), labels, bedsUsed, {color:'#fbbf24'})
  drawBarChart(document.getElementById('chart-outcomes'), ['Recovered', 'Deaths', 'Staff infected'], outcomes, {color:'#34d399', colors:['#34d399','#f87171','#fbbf24']})
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
