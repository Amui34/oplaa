import { describe, it, expect } from 'vitest';
import core from '../extract-core.mjs';
const { legalAlerts, congesAcquisCalc } = core;
// Semaine du lundi 2026-11-02 ; day 0 = lundi … 6 = dimanche
const W='2026-11-02', PREV='2026-10-26', NEXT='2026-11-09';
const sh=(o)=>Object.assign({ id:'s'+Math.random().toString(36).slice(2,8), week:W, empId:'e1', breaks:[] }, o);
const codes=(al)=>al.map(a=>a.code).sort();

describe('alertes légales', () => {
  it('rien à signaler sur une semaine classique', () => {
    const shifts=[0,1,2,3,4].map(d=>sh({ day:d, start:'09:00', end:'17:00', breaks:[{type:'repas',min:30}] }));
    expect(legalAlerts(shifts, W)).toEqual([]);
  });
  it('repos quotidien < 11 h entre deux journées (fermeture tard puis ouverture tôt)', () => {
    const al=legalAlerts([ sh({ day:0, start:'18:00', end:'23:30' }), sh({ day:1, start:'07:00', end:'12:00' }) ], W);
    expect(codes(al)).toEqual(['rest']); expect(al[0].day).toBe(1); expect(al[0].text).toContain('7,5 h');
  });
  it('une coupure dans la même journée n’est pas un repos quotidien', () => {
    expect(legalAlerts([ sh({ day:2, start:'11:00', end:'15:00' }), sh({ day:2, start:'18:00', end:'23:00' }) ], W)).toEqual([]);
  });
  it('service de nuit à cheval sur minuit : repos compté depuis la fin réelle', () => {
    const al=legalAlerts([ sh({ day:4, start:'20:00', end:'02:00' }), sh({ day:5, start:'10:00', end:'14:00' }) ], W);
    expect(codes(al)).toEqual(['rest']); expect(al[0].text).toContain('8 h');
  });
  it('plus de 10 h dans la journée (cumul des services)', () => {
    const al=legalAlerts([ sh({ day:3, start:'08:00', end:'14:00', breaks:[{type:'repas',min:30}] }), sh({ day:3, start:'17:00', end:'23:00', breaks:[{type:'repas',min:30}] }) ], W);
    expect(codes(al)).toEqual(['day']); expect(al[0].text).toContain('11 h');
  });
  it('plus de 48 h dans la semaine', () => {
    const shifts=[0,1,2,3,4,5].map(d=>sh({ day:d, start:'08:00', end:'17:00', breaks:[{type:'repas',min:30}] }));   // 6 × 8,5 h = 51 h
    expect(codes(legalAlerts(shifts, W))).toEqual(['week']);
  });
  it('7 jours d’affilée, y compris à cheval sur la semaine précédente', () => {
    const shifts=[ sh({ week:PREV, day:5, start:'10:00', end:'14:00' }), sh({ week:PREV, day:6, start:'10:00', end:'14:00' }),
      ...[0,1,2,3,4].map(d=>sh({ day:d, start:'10:00', end:'14:00' })) ];
    const al=legalAlerts(shifts, W); expect(codes(al)).toEqual(['consecutive']); expect(al[0].day).toBe(4); expect(al[0].text).toContain('7 jours');
  });
  it('repos du dimanche au lundi suivant pris en compte (semaine suivante)', () => {
    const al=legalAlerts([ sh({ day:6, start:'18:00', end:'23:30' }), sh({ week:NEXT, day:0, start:'06:00', end:'12:00' }) ], NEXT);
    expect(codes(al)).toEqual(['rest']); expect(al[0].day).toBe(0);
  });
  it('pause légale : plus de 6 h sans 20 min de pause', () => {
    const al=legalAlerts([ sh({ day:1, start:'09:00', end:'16:00' }) ], W);
    expect(codes(al)).toEqual(['break']);
    expect(legalAlerts([ sh({ day:1, start:'09:00', end:'16:00', breaks:[{type:'pause',min:20}] }) ], W)).toEqual([]);
    expect(legalAlerts([ sh({ day:1, start:'09:00', end:'16:00' }) ], W, { breakEnabled:false })).toEqual([]);
  });
  it('seuils personnalisables', () => {
    const al=legalAlerts([ sh({ day:0, start:'18:00', end:'23:00' }), sh({ day:1, start:'09:00', end:'12:00' }) ], W, { restHours:9 });
    expect(al).toEqual([]);
  });
  it('les extras (sans fiche employé) sont ignorés', () => {
    expect(legalAlerts([ sh({ empId:'', extraName:'Renfort', day:0, start:'08:00', end:'20:00' }) ], W)).toEqual([]);
  });
});

describe('congés acquis (prorata des jours de présence, année civile)', () => {
  it('toute l’année → le droit annuel complet', () => { expect(congesAcquisCalc(25, null, '2026-12-31').acquis).toBe(25); });
  it('au 1er juillet → à peu près la moitié, arrondie au demi-jour', () => { expect(congesAcquisCalc(25, null, '2026-07-01').acquis).toBe(12.5); });
  it('arrivée récente : compte depuis la date d’arrivée', () => { expect(congesAcquisCalc(25, '2026-10-02', '2026-11-11').acquis).toBe(3); });
  it('arrivée dans le futur → rien d’acquis', () => { expect(congesAcquisCalc(25, '2027-01-15', '2026-11-11').acquis).toBe(0); });
  it('arrivée avant le 1er janvier → compte depuis le 1er janvier', () => { expect(congesAcquisCalc(30, '2020-03-01', '2026-12-31').acquis).toBe(30); });
  it('ne dépasse jamais le droit annuel', () => { expect(congesAcquisCalc(25, '2025-01-01', '2026-12-31').acquis).toBe(25); });
});
