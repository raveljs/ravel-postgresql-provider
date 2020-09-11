'use strict';

const request = require('supertest');

let Ravel, Routes, mapping, transaction, app;

describe('Ravel PostgreSQL Provider integration test', () => {
  beforeEach(async () => {
    process.removeAllListeners('unhandledRejection');

    // scaffold basic Ravel app
    Ravel = require('ravel');
    Routes = Ravel.Routes;
    mapping = Routes.mapping;
    transaction = Routes.transaction;
    app = new Ravel();
    app.set('log level', app.$log.NONE);
    new (require('../lib/ravel-postgresql-provider'))(app); // eslint-disable-line new-cap, no-new
    app.set('postgresql options', {
      user: 'ravel',
      password: 'password',
      port: 15432
    });
    app.set('keygrip keys', ['mysecret']);
  });

  afterEach(async () => {
    await app.close();
    process.removeAllListeners('unhandledRejection');
  });

  it('should provide clients with a connection to query an existing PostgreSQL database', async () => {
    let spy;
    @Routes('/')
    class TestRoutes {
      @transaction
      @mapping(Routes.GET, 'test')
      async testHandler (ctx) {
        expect(ctx.transaction).toBeDefined();
        expect(typeof ctx.transaction).toBe('object');
        expect(ctx.transaction.postgresql).toBeDefined();
        expect(typeof ctx.transaction.postgresql).toBe('object');
        spy = jest.spyOn(ctx.transaction.postgresql, 'query');
        const res = await ctx.transaction.postgresql.query('SELECT 1 AS col');
        ctx.body = res.rows[0];
        return res.rows[0];
      }
    }
    app.load(TestRoutes);
    await app.init();
    await app.emit('pre listen');
    await request.agent(app.callback)
      .get('/test')
      .expect(200, JSON.stringify({ col: 1 }));
    expect(spy).toHaveBeenCalledWith('COMMIT');
  });

  it('should trigger a rollback when a query fails', async () => {
    let spy;
    @Routes('/')
    class TestRoutes {
      @transaction
      @mapping(Routes.GET, 'test')
      async testHandler (ctx) {
        expect(ctx.transaction).toBeDefined();
        expect(typeof ctx.transaction).toBe('object');
        expect(ctx.transaction.postgresql).toBeDefined();
        expect(typeof ctx.transaction.postgresql).toBe('object');
        spy = jest.spyOn(ctx.transaction.postgresql, 'query');
        throw new Error();
      }
    }
    app.load(TestRoutes);
    await app.init();
    await app.emit('pre listen');

    await request.agent(app.server)
      .get('/test');
    expect(spy).toHaveBeenCalledWith('ROLLBACK');
  });
});
