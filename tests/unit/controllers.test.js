const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const modules = {
  candidaturasController: require('../../controllers/candidaturasController'),
  estoqueController: require('../../controllers/estoqueController'),
  loginController: require('../../controllers/loginController'),
  usuariosController: require('../../controllers/usuariosController'),
  vagasController: require('../../controllers/vagasController'),
};

describe('controllers', () => {
  for (const [name, mod] of Object.entries(modules)) {
    test(`${name} exporta um objeto de funções não vazio`, () => {
      const keys = Object.keys(mod);
      assert.ok(keys.length > 0, `${name} não exportou nada`);
      for (const key of keys) {
        assert.equal(typeof mod[key], 'function', `${name}.${key} deveria ser função`);
      }
    });
  }
});
