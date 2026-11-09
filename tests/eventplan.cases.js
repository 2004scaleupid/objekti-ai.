// Sündmuse planeerija testjuhtumid (kasutavad nii testid kui ka 2D/3D eelvaade).
module.exports = {
  small: { name: 'Väike eraüritus 10 × 7 m, 12 külalist', venue: 'outdoor', area: { l: 10, w: 7 }, guests: 12, tent: { type: 'any' },
    items: [{ kind: 'seating', table: 'rect183', guests: 12, single: true }, { kind: 'stage', w: 4, d: 3 }, { kind: 'dance', w: 2, d: 2 }, { kind: 'catering', n: 1, w: 2, d: .75 }] },
  wedding: { name: 'Pulm 80 külalist', venue: 'outdoor', guests: 80, tent: { type: 'modular' },
    items: [{ kind: 'seating', table: 'round180', guests: 80 }, { kind: 'stage', w: 4, d: 3, name: 'Bändi lava' }, { kind: 'dance', w: 5, d: 5 }, { kind: 'catering', n: 2 }, { kind: 'bar', n: 1 }] },
  company: { name: 'Firmapidu 150, segaistumine', venue: 'outdoor', guests: 150, tent: { type: 'modular' },
    items: [{ kind: 'seating', table: 'round180', guests: 100 }, { kind: 'seating', table: 'rect183', guests: 50 }, { kind: 'stage', w: 6, d: 4 }, { kind: 'bar', n: 2 }, { kind: 'catering', n: 3 }] },
  gala: { name: 'Gala 250, Ø180 lauad', venue: 'outdoor', guests: 250, tent: { type: 'modular' },
    items: [{ kind: 'seating', table: 'round180', guests: 250 }, { kind: 'stage', w: 8, d: 4 }, { kind: 'dance', w: 6, d: 6 }, { kind: 'bar', n: 2 }, { kind: 'catering', n: 4 }] },
  standing: { name: 'Püstivastuvõtt 300', venue: 'outdoor', guests: 300, tent: { type: 'modular' },
    items: [{ kind: 'standing', guests: 300 }, { kind: 'bar', n: 3 }, { kind: 'catering', n: 4 }, { kind: 'stage', w: 4, d: 2 }] },
  festival: { name: 'Festivaliala väljas', venue: 'outdoor', area: { l: 70, w: 45 }, guests: 1500, tent: { type: 'none' },
    items: [{ kind: 'stage', w: 8, d: 6, name: 'Trusslava', product: 'truss-stage' }, { kind: 'audience', guests: 1500 }, { kind: 'popup', n: 8, size: [3, 3] }, { kind: 'wc', n: 12 }, { kind: 'bar', n: 3 }] }
};
