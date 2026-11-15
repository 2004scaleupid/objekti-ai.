// UI-testi abi (ei lähe gitti): stuudio ilma sisselogimiseta, ai-image asendatud, et näha iga olekut
window.H = {
  log: [],
  mode: 'ok', delay: 1500,
  async boot(tpl) {
    $('login').hidden = true; if ($('boot')) $('boot').hidden = true; $('app').hidden = false;
    CL.cid = 't'; acct.credits = 50; window.clRefresh = async () => {};
    window.clFn = async (f, b) => {
      H.log.push([f, b && (b.action || b.kind), b && b.text]);
      if (f === 'room-3d') { if (b.action === 'start') { acct.credits = 44; return { id: 'r1', status: 'pending', stage: 'measure', measure: false, credits: 44 }; }
        return { status: 'pending', stage: 'parts', measure: true, room: { w: 2, d: 1.8, h: 2.1, est: true }, floor: true, wall: true, items: [1, 3] }; }
      if (f !== 'ai-image') return {};
      await new Promise(r => setTimeout(r, H.delay));
      if (H.mode === 'same') return { same: true, refunded: 4, credits: 50 };
      if (H.mode === 'err') { const e = new Error('Töö ebaõnnestus, 4 krediiti tagastati.'); e.refunded = 4; throw e; }
      acct.credits = 46; return { urls: [await H.durl('s5.jpg', .55), await H.durl('s5.jpg', .75)], credits: 46 };
    };
    openStudio(tpl || 'sisek'); await new Promise(r => setTimeout(r, 400));
  },
  async add(names, slow) {
    if (slow && !H._sh) { H._sh = shrink; window.shrink = async (...a) => { await new Promise(r => setTimeout(r, 1500)); return H._sh(...a); }; }
    const files = await Promise.all(names.map(async n => { const b = await (await fetch('/.shots/st/' + n)).blob(); return new File([b], n, { type: 'image/jpeg' }); }));
    return stAddFiles(files);
  },
  async durl(n, k) { const im = await createImageBitmap(await (await fetch('/.shots/st/' + n)).blob(), { imageOrientation: 'from-image' });
    const c = document.createElement('canvas'); c.width = im.width / 2; c.height = im.height / 2; const g = c.getContext('2d'); g.filter = 'brightness(' + k + ') saturate(.6)'; g.drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .8); },
  type(t) { const i = $('stIn'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); },
};
