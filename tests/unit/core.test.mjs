// Tests unitaires — logique de calcul pure (heures, pauses, tickets, jours fériés).
import { describe, it, expect } from 'vitest';
import core from '../extract-core.mjs';
const { toMin, addMin, hoursBetween, breakMinutes, shiftHours, realHours, shiftSpan, coversLunch, easterDate, frHolidays, isHoliday, isoDay, addDays, mondayOf } = core;

describe('heures / temps', () => {
  it('toMin convertit HH:MM en minutes', () => {
    expect(toMin('00:00')).toBe(0);
    expect(toMin('09:30')).toBe(570);
    expect(toMin('23:59')).toBe(1439);
  });
  it('hoursBetween gère le passage à minuit', () => {
    expect(hoursBetween('09:00', '17:00')).toBe(8);
    expect(hoursBetween('22:00', '06:00')).toBe(8); // nuit
    expect(hoursBetween('18:00', '18:00')).toBe(0);
  });
  it('addMin ajoute des minutes en bouclant sur 24 h', () => {
    expect(addMin('23:30', 45)).toBe('00:15');
    expect(addMin('08:00', 90)).toBe('09:30');
  });
});

describe('durée des services et pauses', () => {
  it('breakMinutes additionne les pauses', () => {
    expect(breakMinutes({ breaks: [{ min: 30 }, { min: 15 }] })).toBe(45);
    expect(breakMinutes({ breaks: [] })).toBe(0);
    expect(breakMinutes({})).toBe(0);
  });
  it('shiftHours = amplitude prévue moins pauses', () => {
    expect(shiftHours({ start: '11:00', end: '15:00', breaks: [] })).toBe(4);
    expect(shiftHours({ start: '11:00', end: '15:00', breaks: [{ min: 30 }] })).toBe(3.5);
  });
  it('realHours utilise le réel si saisi, sinon le prévu', () => {
    expect(realHours({ start: '09:00', end: '17:00', realStart: '09:15', realEnd: '17:00', breaks: [] })).toBeCloseTo(7.75, 5);
    expect(realHours({ start: '09:00', end: '17:00', breaks: [] })).toBe(8);
  });
  it('shiftSpan = amplitude sans déduire les pauses', () => {
    expect(shiftSpan({ start: '09:00', end: '15:30', breaks: [{ min: 60 }] })).toBe(6.5);
  });
});

describe('tickets restaurant (règle déjeuner)', () => {
  it('coversLunch vrai si présent de 12:30 à 13:30', () => {
    expect(coversLunch({ start: '11:00', end: '15:00' })).toBe(true);
    expect(coversLunch({ start: '12:00', end: '14:00' })).toBe(true);
    expect(coversLunch({ start: '18:00', end: '23:00' })).toBe(false); // soir seulement
    expect(coversLunch({ start: '09:00', end: '13:00' })).toBe(false); // finit trop tôt
  });
});

describe('jours fériés français', () => {
  it('easterDate — dimanche de Pâques', () => {
    // Pâques 2026 = 5 avril ; 2024 = 31 mars
    expect(isoDay(easterDate(2026))).toBe('2026-04-05');
    expect(isoDay(easterDate(2024))).toBe('2024-03-31');
  });
  it('frHolidays contient les fériés fixes + mobiles', () => {
    const h = frHolidays(2026);
    expect(h.has('2026-01-01')).toBe(true); // Jour de l'an
    expect(h.has('2026-05-01')).toBe(true); // Fête du travail
    expect(h.has('2026-12-25')).toBe(true); // Noël
    expect(h.has('2026-04-06')).toBe(true); // Lundi de Pâques (Pâques + 1)
  });
  it('isHoliday distingue férié et jour normal', () => {
    expect(isHoliday(new Date(2026, 4, 1))).toBe(true);  // 1er mai
    expect(isHoliday(new Date(2026, 4, 2))).toBe(false); // 2 mai
    expect(isHoliday(new Date(2026, 6, 14))).toBe(true); // 14 juillet
  });
});

describe('dates', () => {
  it('mondayOf renvoie le lundi de la semaine', () => {
    // 2026-09-23 est un mercredi → lundi = 2026-09-21
    expect(isoDay(mondayOf(new Date(2026, 8, 23)))).toBe('2026-09-21');
  });
  it('addDays décale de N jours', () => {
    expect(isoDay(addDays('2026-09-21', 6))).toBe('2026-09-27');
  });
});
