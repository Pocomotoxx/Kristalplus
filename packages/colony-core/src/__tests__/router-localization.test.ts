import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MoERouter } from '../neural/moe-router.js';

test('cold-start routing recognizes Hungarian role keywords', () => {
  const cases: Array<[string, string]> = [
    ['Javítsd ki a sebezhetőséget, ellenőrizd a jogosultságokat és a biztonságot.', 'security'],
    ['Készíts architektúra tervet és specifikációt a rendszerhez.', 'architect'],
    ['Írj teszteket, tesztelést és tesztlefedettséget.', 'tester'],
    ['Végezz kódellenőrzést, auditálást és felülvizsgálatot.', 'reviewer'],
    ['Készíts implementációt, javítsd a hibát és fejleszd a kódot.', 'engineer'],
    ['Tervezz mérföldköveket és delegálj feladatokat a projekthez.', 'director'],
  ];
  const router = new MoERouter();
  for (const [description, role] of cases) {
    assert.equal(router.routeTask(description, { record: false }).targetRole, role, description);
  }
});
