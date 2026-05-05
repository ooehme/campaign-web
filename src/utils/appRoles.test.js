import test from 'node:test'
import assert from 'node:assert/strict'
import { appRoleLabel, isAppRole, APP_ROLE_OPTIONS } from './appRoles'

test('create user manager/admin/default roles are canonical', () => {
  assert.deepEqual(APP_ROLE_OPTIONS.map((o) => o.value), ['user', 'manager', 'admin'])
})

test('edit preselect supports existing manager app_role', () => {
  assert.equal(isAppRole('manager'), true)
})

test('overview/profile display manager as Manager', () => {
  assert.equal(appRoleLabel('manager'), 'Manager')
})

test('unknown role remains visible', () => {
  assert.equal(appRoleLabel('campaign-manager'), 'Unbekannt (campaign-manager)')
})

test('ui canonical guard does not treat campaign-manager as app_role', () => {
  assert.equal(isAppRole('campaign-manager'), false)
})
