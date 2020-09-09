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
    process.removeAllListeners('unhandledRejection');
  });

  it('should provide clients with a connection to query an existing PostgreSQL database', async () => {
    @Routes('/')
    class TestRoutes {
      @transaction
      @mapping(Routes.GET, 'test')
      testHandler (ctx) {
        expect(ctx).to.have.a.property('transaction').that.is.an('object');
        expect(ctx.transaction).to.have.a.property('postgresql').that.is.an('object');
        return new Promise((resolve, reject) => {
          ctx.transaction.postgresql.query('SELECT 1 AS col', (err, res) => {
            if (err) { return reject(err); }
            ctx.body = res.rows[0];
            resolve(res.rows[0]);
          });
        });
      }
    }
    app.load(TestRoutes);
    await app.init();
    app.emit('pre listen');

    await request.agent(app.server)
      .get('/test')
      .expect(200, JSON.stringify({ col: 1 }));
  });

  it('should trigger a rollback when a query fails', async () => {
    let spy;
    @Routes('/')
    class TestRoutes {
      @transaction
      @mapping(Routes.GET, 'test')
      testHandler (ctx) {
        expect(ctx).to.have.a.property('transaction').that.is.an('object');
        expect(ctx.transaction).to.have.a.property('postgresql').that.is.an('object');
        spy = jest.spyOn(ctx.transaction.postgresql, 'query');
        return Promise.reject(new Error());
      }
    }
    app.load(TestRoutes);
    await app.init();
    app.emit('pre listen');

    try {
      await request.agent(app.server)
        .get('/test');
      expect(spy).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
