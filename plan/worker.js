// Lahendaja eraldi lõimes, et leht ei hanguks (suured telgid võtavad mõne sekundi).
importScripts('../js/eventplan.js');
onmessage = e => { const { id, spec, cat } = e.data; try { postMessage({ id, r: self.EventPlan.solve(spec, cat) }); } catch (er) { postMessage({ id, err: String(er && er.stack || er) }); } };
