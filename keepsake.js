/* Local-only name card and a recommendation link without form parameters. */
(function () {
  function siteURL(value) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin === 'null') return '';
      // The application is served at the origin root. Never forward a query,
      // fragment, username, password, or the user's current form data.
      return `${url.origin}/`;
    } catch (error) {
      return '';
    }
  }

  function recommendationURL(value) {
    const base = siteURL(value);
    return base ? `${base}?utm_source=share&utm_medium=referral` : '';
  }

  function clean(value) { return String(value ?? '').replace(/\s+/gu, ' ').trim(); }
  function validate(name, wish) {
    const cleanName = clean(name), cleanWish = clean(wish);
    if (!cleanName) return { error: '请先填写想写在心愿卡上的名字。', name: cleanName, wish: cleanWish };
    if ([...cleanName].length > 12) return { error: '名字最多填写 12 个字符。', name: cleanName, wish: cleanWish };
    if ([...cleanWish].length > 40) return { error: '祝愿最多填写 40 个字符。', name: cleanName, wish: cleanWish };
    return { error: '', name: cleanName, wish: cleanWish };
  }

  function wrap(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const char of text) {
      const next = line + char;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = char; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function draw(canvas, name, wish, link) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const width = canvas.width, height = canvas.height;
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#f9f5ed'); background.addColorStop(1, '#e9efe8');
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#c4b39a'; ctx.lineWidth = 2; ctx.strokeRect(48, 48, width - 96, height - 96);
    ctx.strokeStyle = '#b59a7b42'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(width / 2, height * .42, 310, 310, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(width / 2, height * .42, 350, 210, -.45, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#a94f3f'; ctx.textAlign = 'center';
    ctx.font = '500 22px sans-serif'; ctx.fillText('A NAME, A WISH', width / 2, 152);
    ctx.fillStyle = '#64746f'; ctx.font = '500 25px sans-serif'; ctx.fillText('写给未来的一份心意', width / 2, 215);
    const title = clean(name) || '在这里写下名字';
    let size = title === '在这里写下名字' ? 65 : 112;
    do { ctx.font = `600 ${size}px "Noto Serif CJK SC", "Songti SC", serif`; size -= 4; }
    while (ctx.measureText(title).width > width - 180 && size > 32);
    ctx.fillStyle = '#17202b'; ctx.fillText(title, width / 2, 455);
    ctx.fillStyle = '#a94f3f'; ctx.fillRect(width / 2 - 24, 497, 48, 3);
    ctx.font = '400 31px "Noto Sans CJK SC", "PingFang SC", sans-serif'; ctx.fillStyle = '#536762';
    wrap(ctx, clean(wish), width - 230).forEach((line, index) => ctx.fillText(line, width / 2, 570 + index * 53));
    ctx.strokeStyle = '#c5b8a1'; ctx.beginPath(); ctx.moveTo(220, 895); ctx.lineTo(width - 220, 895); ctx.stroke();
    ctx.fillStyle = '#17202b'; ctx.font = '600 33px "Noto Serif CJK SC", "Songti SC", serif'; ctx.fillText('序 名', width / 2, 956);
    ctx.fillStyle = '#788981'; ctx.font = '400 21px sans-serif';
    const address = link ? new URL(link).host : '本地预览';
    ctx.fillText(address, width / 2, 1000, width - 180);
    return true;
  }

  window.Keepsake = { siteURL, recommendationURL, validate, draw };
}());
