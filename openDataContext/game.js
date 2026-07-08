const sharedCanvas = typeof wx !== 'undefined' && wx.getSharedCanvas
  ? wx.getSharedCanvas()
  : null
const ctx = sharedCanvas ? sharedCanvas.getContext('2d') : null

function drawPlaceholder() {
  if (!ctx || !sharedCanvas) return

  ctx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
  ctx.fillRect(0, 0, sharedCanvas.width, sharedCanvas.height)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '24px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Friend Ranking', sharedCanvas.width / 2, sharedCanvas.height / 2)
}

if (typeof wx !== 'undefined' && wx.onMessage) {
  wx.onMessage((message) => {
    if (message && message.type === 'showRank') {
      drawPlaceholder()
    }
  })
}
