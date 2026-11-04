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
    background.addColorStop(0, '#f5effd'); background.addColorStop(.5, '#fff9fc'); background.addColorStop(1, '#eaf5fc');
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#cfc0df'; ctx.lineWidth = 2; ctx.strokeRect(48, 48, width - 96, height - 96);
    ctx.strokeStyle = '#b6a3cf42'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(width / 2, height * .42, 310, 310, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(width / 2, height * .42, 350, 210, -.45, 0, Math.PI * 2); ctx.stroke();
    // A decorative star field and ink-wash horizon stay clear of the name.
    for (let i = 0; i < 30; i++) {
      const x = 75 + (i * 137) % (width - 150), y = 80 + (i * 61) % 275;
      if (x > width * .25 && x < width * .75) continue;
      ctx.fillStyle = i % 2 ? '#b8a1cf88' : '#99bad188';
      ctx.beginPath(); ctx.arc(x, y, i % 6 === 0 ? 2.8 : 1.5, 0, Math.PI * 2); ctx.fill();
    }
    const moon = ctx.createRadialGradient(width - 160, 252, 5, width - 160, 252, 65);
    moon.addColorStop(0, '#fffefa'); moon.addColorStop(.4, '#f5eafb99'); moon.addColorStop(1, '#e5d5f300');
    ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(width - 160, 252, 65, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b8a1cc88'; ctx.beginPath(); ctx.arc(width - 160, 252, 23, 0, Math.PI * 2); ctx.stroke();
    const hills = ctx.createLinearGradient(0, 730, 0, 890);
    hills.addColorStop(0, '#a3b8d33b'); hills.addColorStop(1, '#e3d9f000');
    ctx.fillStyle = hills; ctx.beginPath(); ctx.moveTo(49, 818);
    for (const [x,y] of [[153,772],[224,802],[327,739],[418,794],[507,764],[615,810],[724,751],[width-49,800],[width-49,889],[49,889]]) ctx.lineTo(x,y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#bdaccd55'; ctx.beginPath(); ctx.moveTo(49, 843); ctx.bezierCurveTo(245, 798, 414, 892, width - 49, 826); ctx.stroke();
    ctx.fillStyle = '#a184b5'; ctx.textAlign = 'center';
    ctx.font = '500 22px sans-serif'; ctx.fillText('A NAME, A WISH', width / 2, 152);
    ctx.fillStyle = '#8c799c'; ctx.font = '500 25px sans-serif'; ctx.fillText('写给未来的一份心意', width / 2, 215);
    const title = clean(name) || '在这里写下名字';
    let size = title === '在这里写下名字' ? 65 : 112;
    do { ctx.font = `600 ${size}px "Noto Serif CJK SC", "Songti SC", serif`; size -= 4; }
    while (ctx.measureText(title).width > width - 180 && size > 32);
    ctx.fillStyle = '#786084'; ctx.fillText(title, width / 2, 455);
    ctx.fillStyle = '#bb91af'; ctx.fillRect(width / 2 - 24, 497, 48, 3);
    ctx.font = '400 31px "Noto Sans CJK SC", "PingFang SC", sans-serif'; ctx.fillStyle = '#8a7297';
    wrap(ctx, clean(wish), width - 230).forEach((line, index) => ctx.fillText(line, width / 2, 570 + index * 53));
    ctx.strokeStyle = '#c7b4d8'; ctx.beginPath(); ctx.moveTo(220, 895); ctx.lineTo(width - 220, 895); ctx.stroke();
    ctx.fillStyle = '#786084'; ctx.font = '600 33px "Noto Serif CJK SC", "Songti SC", serif'; ctx.fillText('序 名', width / 2, 956);
    ctx.fillStyle = '#9c87ad'; ctx.font = '400 21px sans-serif';
    const address = link ? new URL(link).host : '本地预览';
    ctx.fillText(address, width / 2, 1000, width - 180);
    return true;
  }

  window.Keepsake = { siteURL, recommendationURL, validate, draw };
}());
