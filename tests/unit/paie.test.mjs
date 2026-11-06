// Tests unitaires — moteur de paie HCR (paliers d'heures sup, complémentaires, noms).
import { describe, it, expect } from 'vitest';
import core from '../extract-core.mjs';
const { hcrTiers, payWeekSplit, payContractSup, payPeriod, splitName, dailyContractHours, fullName, splitNameRaw, nameParts, ensureNameParts } = core;
const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('paliers HCR (temps plein)', () => {
  it('contrat 39 h : 4 h structurelles à +10 %', () => {
    expect(payContractSup(39)).toEqual({ sup10: 4, sup20: 0, sup50: 0 });
    expect(payContractSup(35)).toEqual({ sup10: 0, sup20: 0, sup50: 0 });
    expect(payContractSup(43)).toEqual({ sup10: 4, sup20: 4, sup50: 0 });
  });
  it('contrat 39 h, 42 h travaillées → 3 h à +20 % (palier 40-43)', () => {
    const r = payWeekSplit(42, 39);
    expect(r.sup10).toBe(0); expect(r.sup20).toBe(3); expect(r.sup50).toBe(0); expect(r.manquantes).toBe(0);
  });
  it('contrat 35 h, 46 h travaillées → 4 h +10 %, 4 h +20 %, 3 h +50 %', () => {
    const r = payWeekSplit(46, 35);
    expect(r.sup10).toBe(4); expect(r.sup20).toBe(4); expect(r.sup50).toBe(3);
  });
  it('contrat 37 h, 41 h → 2 h +10 % puis 2 h +20 %', () => {
    const r = payWeekSplit(41, 37); expect(r.sup10).toBe(2); expect(r.sup20).toBe(2);
  });
  it('moins que le contrat → heures manquantes, aucune sup', () => {
    const r = payWeekSplit(30, 39); expect(r.manquantes).toBe(9); expect(r.sup10 + r.sup20 + r.sup50).toBe(0);
  });
  it('paliers paramétrables (t10End/t20End)', () => {
    expect(hcrTiers(35, 48, 39, 43)).toEqual({ sup10: 4, sup20: 4, sup50: 5 });
    expect(hcrTiers(35, 48, 41, 46)).toEqual({ sup10: 6, sup20: 5, sup50: 2 });
  });
});

describe('temps partiel (heures complémentaires)', () => {
  it('contrat 24 h, 27 h travaillées → 2,4 h à +10 % puis 0,6 h à +25 %', () => {
    const r = payWeekSplit(27, 24); close(r.compl10, 2.4); close(r.compl25, 0.6); expect(r.sup10).toBe(0);
  });
  it('contrat 20 h, 21 h → tout en +10 %', () => { const r = payWeekSplit(21, 20); close(r.compl10, 1); expect(r.compl25).toBe(0); });
});

describe('extras et agrégats', () => {
  it('sans contrat → toutes les heures sont « normales »', () => { const r = payWeekSplit(12, 0); expect(r.normales).toBe(12); });
  it('payPeriod additionne les semaines', () => {
    const r = payPeriod([39, 42, 30, 46], 39);
    expect(r.sup20).toBe(3 + 4); expect(r.sup50).toBe(3); expect(r.manquantes).toBe(9);
  });
  it('journée contrat moyenne : 39 h / 5 j = 7,8 h', () => { close(dailyContractHours(39, 5), 7.8); expect(dailyContractHours(0, 5)).toBe(0); });
});

describe('nom / prénom', () => {
  it('« Camille Durand » → prénom Camille, nom DURAND', () => { expect(splitName('Camille Durand')).toEqual({ prenom: 'Camille', nom: 'DURAND' }); });
  it('« DURAND Camille » (nom en capitales d’abord) → idem', () => { expect(splitName('DURAND Camille')).toEqual({ prenom: 'Camille', nom: 'DURAND' }); });
  it('nom composé', () => { expect(splitName('Jean-Pierre de la Tour')).toEqual({ prenom: 'Jean-Pierre', nom: 'DE LA TOUR' }); });
  it('un seul mot → prénom', () => { expect(splitName('Léo')).toEqual({ prenom: 'Léo', nom: '' }); });
});

describe('fiche employé : prénom et nom séparés', () => {
  it('nom complet = prénom + nom', () => { expect(fullName(' Camille ', 'Durand')).toBe('Camille Durand'); expect(fullName('Léo', '')).toBe('Léo'); });
  it('ancienne fiche (nom complet seul) → prénom / nom déduits, casse conservée', () => {
    expect(ensureNameParts({ name: 'Jean-Pierre de la Tour' })).toMatchObject({ firstName: 'Jean-Pierre', lastName: 'de la Tour' });
    expect(splitNameRaw('DURAND Camille')).toEqual({ prenom: 'Camille', nom: 'DURAND' });
  });
  it('champs dédiés prioritaires quand ils sont cohérents avec le nom complet (prénom composé)', () => {
    expect(nameParts({ name: 'Marie Anne Dupont', firstName: 'Marie Anne', lastName: 'Dupont' })).toEqual({ prenom: 'Marie Anne', nom: 'Dupont' });
  });
  it('fiche renommée par une ancienne version (champs périmés) → on se fie au nom complet', () => {
    expect(nameParts({ name: 'Zoé Martin', firstName: 'Camille', lastName: 'Durand' })).toEqual({ prenom: 'Zoé', nom: 'Martin' });
  });
});
