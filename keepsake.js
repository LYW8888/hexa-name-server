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

  function draw(canvas, name, wish, link, artwork) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const width = canvas.width, height = canvas.height;
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#FAF8F2'); background.addColorStop(.5, '#FFFDF7'); background.addColorStop(1, '#F3F4EB');
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#B59C68'; ctx.lineWidth = 2; ctx.strokeRect(48, 48, width - 96, height - 96);
    // Small gold points leave the name clear; artwork is bundled on this origin.
    for (let i = 0; i < 30; i++) {
      const x = 75 + (i * 137) % (width - 150), y = 80 + (i * 61) % 275;
      if (x > width * .25 && x < width * .75) continue;
      ctx.fillStyle = i % 2 ? '#B59C6888' : '#8FA99C88';
      ctx.beginPath(); ctx.arc(x, y, i % 6 === 0 ? 2.8 : 1.5, 0, Math.PI * 2); ctx.fill();
    }
    const moon = ctx.createRadialGradient(width - 160, 252, 5, width - 160, 252, 65);
    moon.addColorStop(0, '#FFFEF6'); moon.addColorStop(.4, '#E9EFDF99'); moon.addColorStop(1, '#DCE5D700');
    ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(width - 160, 252, 65, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#B59C6888'; ctx.beginPath(); ctx.arc(width - 160, 252, 23, 0, Math.PI * 2); ctx.stroke();
    if (artwork?.naturalWidth && artwork.naturalHeight) {
      // Crop the painted mist and mountain portion, leaving the title unobscured.
      const cut = artwork.naturalHeight * .4;
      ctx.drawImage(artwork, 0, cut, artwork.naturalWidth, artwork.naturalHeight-cut, 49, 700, width-98, 235);
    }
    ctx.fillStyle = '#56877E'; ctx.textAlign = 'center';
    ctx.font = '500 22px sans-serif'; ctx.fillText('A NAME, A WISH', width / 2, 152);
    ctx.fillStyle = '#657C7A'; ctx.font = '500 25px sans-serif'; ctx.fillText('写给未来的一份心意', width / 2, 215);
    const title = clean(name) || '在这里写下名字';
    let size = title === '在这里写下名字' ? 65 : 112;
    do { ctx.font = `600 ${size}px "Noto Serif CJK SC", "Songti SC", serif`; size -= 4; }
    while (ctx.measureText(title).width > width - 180 && size > 32);
    ctx.fillStyle = '#243D46'; ctx.fillText(title, width / 2, 455);
    ctx.fillStyle = '#B59C68'; ctx.fillRect(width / 2 - 24, 497, 48, 3);
    ctx.font = '400 31px "Noto Sans CJK SC", "PingFang SC", sans-serif'; ctx.fillStyle = '#4E7168';
    wrap(ctx, clean(wish), width - 230).forEach((line, index) => ctx.fillText(line, width / 2, 570 + index * 53));
    ctx.strokeStyle = '#B59C68'; ctx.beginPath(); ctx.moveTo(220, 895); ctx.lineTo(width - 220, 895); ctx.stroke();
    ctx.fillStyle = '#243D46'; ctx.font = '600 33px "Noto Serif CJK SC", "Songti SC", serif'; ctx.fillText('序 名', width / 2, 956);
    ctx.fillStyle = '#657C7A'; ctx.font = '400 21px sans-serif';
    const address = link ? new URL(link).host : '本地预览';
    ctx.fillText(address, width / 2, 1000, width - 180);
    return true;
  }

  window.Keepsake = { siteURL, recommendationURL, validate, draw };
}());
