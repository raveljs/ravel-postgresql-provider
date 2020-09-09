'use strict';

let Ravel, app;

describe('Ravel PostgreSQL Provider', async () => {
  beforeEach(async () => {
    process.removeAllListeners('unhandledRejection');

    Ravel = require('ravel');
    app = new Ravel();
    // app.set('log level', app.log.NONE);  this won't work because app.init() is never called in these tests
    app.set('log level', app.$log.NONE);
    app.set('keygrip keys', ['mysecret']);
  });

  afterEach(async () => {
    process.removeAllListeners('unhandledRejection');
  });

  describe('#prelisten()', async () => {
    it('should create a generic pool of connections', async () => {
      const provider = new (require('../lib/ravel-postgresql-provider'))(app);
      app.set('postgresql options', {
        user: 'ravel',
        password: 'password',
        port: 15432
      });
      await app.init();

      provider.prelisten(app);
      expect(typeof provider.pool).toBe('object');
      expect(provider.pool).toHaveProperty('acquire');
      expect(typeof provider.pool.acquire).toBe('function');
      expect(provider.pool).toHaveProperty('release');
      expect(typeof provider.pool.release).toBe('function');
      expect(provider.pool).toHaveProperty('destroy');
      expect(typeof provider.pool.destroy).toBe('function');
      await app.close();
    });

    it('should create a pool which destroys connections when they error out', async () => {
      const connectError = new Error();
      const EventEmitter = require('events');
      class StubClient extends EventEmitter {
        connect (cb) {
          console.log('Killing myself');
          this.emit('error');
          cb(connectError);
        }
      }
      const client = new StubClient();

      const pg = {
        Client: function () {
          return client;
        }
      };

      jest.doMock('pg', pg);
      const provider = new (require('../lib/ravel-postgresql-provider'))(app);

      app.set('postgresql options', {
        user: 'ravel',
        password: 'password',
        port: 15432
      });
      await app.init();

      provider.prelisten(app);
      const spy = jest.spyOn(provider.pool, 'destroy');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('#end()', async () => {
    it('should drain all connections in the pool', async () => {
      const provider = new (require('../lib/ravel-postgresql-provider'))(app);
      app.set('postgresql options', {
        user: 'ravel',
        password: 'password',
        port: 15432
      });
      await app.init();

      provider.prelisten(app);
      const drainSpy = jest.spyOn(provider.pool, 'drain');

      provider.end();
      await app.close();
      expect(drainSpy).toHaveBeenCalled();
    });

    it('should do nothing when the provider is not initialized', async () => {
      const provider = new (require('../lib/ravel-postgresql-provider'))(app);
      provider.end();
      await app.close();
    });
  });

  describe('#release()', async () => {
    it('should release a connection back to the pool if no errors were encountered', async () => {
      const provider = new (require('../lib/ravel-postgresql-provider'))(app);
      app.set('postgresql options', {
        user: 'ravel',
        password: 'password',
        port: 15432
      });
      await app.init();

      provider.prelisten(app);
      const releaseSpy = jest.spyOn(provider.pool, 'release');
      const conn = await provider.getTransactionConnection();
      provider.release(conn);
      expect(releaseSpy).toHaveBeenCalled();
      await app.close();
    });

    it('should remove a connection from the pool permanently if fatal errors were encountered', async () => {
      const provider = new (require('../lib/ravel-postgresql-provider'))(app);
      app.set('postgresql options', {
        user: 'ravel',
        password: 'password',
        port: 15432
      });
      await app.init();

      provider.prelisten(app);
      const destroySpy = jest.spyOn(provider.pool, 'destroy');
      const conn = await provider.getTransactionConnection();
      const err = new Error();
      err.fatal = true;
      provider.release(conn, err);
      expect(destroySpy).toHaveBeenCalled();
      await app.close();
    });
  });

  describe('#getTransactionConnection()', async () => {
    it('should resolve with a connection', async () => {
      const provider = new (require('../lib/ravel-postgresql-provider'))(app);
      app.set('postgresql options', {
        user: 'ravel',
        password: 'password',
        port: 15432
      });
      await app.init();

      provider.prelisten(app);
      const conn = await provider.getTransactionConnection();
      expect(conn).toHaveProperty('query');
      expect(typeof conn.query).toBe('function');
      provider.release(conn);
      provider.end();
      await app.close();
    });

    it('should reject when a connection cannot be obtained', async () => {
      const connectError = new Error();
      const pg = {
        Client: function (opts) {
          // empty
        }
      };
      pg.Client.prototype.connect = function (cb) {
        cb(connectError);
      };
      jest.doMock('pg', pg);

      const provider = new (require('../lib/ravel-postgresql-provider'))(app);
      app.set('postgresql options', {
        user: 'ravel',
        password: 'password',
        port: 15432
      });
      await app.init();

      provider.prelisten(app);
      await expect(provider.getTransactionConnection()).rejects.toThrow(connectError);
      await app.close();
    });

    it('should reject when a transaction cannot be opened', async () => {
      const EventEmitter = require('events').EventEmitter;
      const conn = new EventEmitter();
      const beginTransactionError = new Error();
      conn.connect = (cb) => cb();
      conn.begin = (cb) => cb(beginTransactionError);
      const postgresql = {
        createConnection: () => conn
      };
      jest.doMock('pg', postgresql);

      const provider = new (require('../lib/ravel-postgresql-provider'))(app);
      provider.pool = {
        acquire: (cb) => cb(null, conn),
        drain: function (cb) { cb(); },
        destroyAllNow: function () {}
      };

      await expect(provider.getTransactionConnection()).rejects.toThrow(beginTransactionError);
    });
  });

  describe('#exitTransaction()', async () => {
    let provider, connection;

    beforeEach(async () => {
      connection = {
        commit: (cb) => cb(),
        rollback: (cb) => cb()
      };
      provider = new (require('../lib/ravel-postgresql-provider'))(app);
      provider.pool = {
        destroy: function () {},
        release: function () {},
        drain: function (cb) { cb(); },
        destroyAllNow: function () {}
      };
    });

    it('should call commit on the connection, release it and resolve when shouldCommit is true', async () => {
      const commitStub = jest.fn((cb) => cb());
      connection.commit = commitStub;
      const releaseSpy = jest.spyOn(provider.pool, 'release');

      await expect(provider.exitTransaction(connection, true)).resolves;
      await expect(commitStub).toHaveBeenCalled();
      await expect(releaseSpy).toHaveBeenCalled();
    });

    it('should call commit on the connection, release it and reject when shouldCommit is true and a commit error occurred. should attempt to rollback.', async () => {
      const commitErr = new Error();
      connection.commit = jest.fn((cb) => cb(commitErr));
      connection.rollBack = jest.fn((cb) => cb());
      const releaseSpy = jest.spyOn(provider.pool, 'release');

      await expect(provider.exitTransaction(connection, true)).rejects.toThrow(commitErr);
      await expect(connection.commit).toHaveBeenCalled();
      await expect(releaseSpy).toHaveBeenCalled();
      await expect(connection.rollBack).toHaveBeenCalled();
    });

    it('should call commit on the connection, release it and reject with a rollback error when shouldCommit is true and a commit error occurred, followed by a rollback error.', async () => {
      const commitErr = new Error();
      connection.commit = jest.fn((cb) => cb(commitErr));
      const rollbackErr = new Error();
      connection.rollBack = jest.fn((cb) => (rollbackErr));
      const releaseSpy = jest.spyOn(provider.pool, 'release');

      await expect(provider.exitTransaction(connection, true)).rejects.toThrow(rollbackErr);
      await expect(connection.commit).toHaveBeenCalled();
      await expect(releaseSpy).toHaveBeenCalled();
      await expect(connection.rollBack).toHaveBeenCalled();
    });

    it('should call commit on the connection, destroy it and reject when shouldCommit is true and a fatal commit error occurred', async () => {
      const fatalErr = new Error();
      fatalErr.fatal = true;
      connection.commit = jest.fn((cb) => cb(fatalErr));
      const destroySpy = jest.spyOn(provider.pool, 'destroy');

      await expect(provider.exitTransaction(connection, true)).rejects.toThrow(fatalErr);
      await expect(connection.commit).toHaveBeenCalled();
      await expect(destroySpy).toHaveBeenCalled();
    });

    it('should call rollback on the connection, release it and resolve when shouldCommit is false', async () => {
      connection.rollBack = jest.fn((cb) => cb());
      const releaseSpy = jest.spyOn(provider.pool, 'release');

      await expect(provider.exitTransaction(connection, false)).resolves;
      await expect(connection.rollBack).toHaveBeenCalled();
      await expect(releaseSpy).toHaveBeenCalled();
    });

    it('should call rollback on the connection, release it and reject when shouldCommit is false and a rollback error occurred', async () => {
      const rollbackErr = new Error();
      connection.rollBack = jest.fn((cb) => cb(rollbackErr));
      const releaseSpy = jest.spyOn(provider.pool, 'release');

      await expect(provider.exitTransaction(connection, false)).rejects.toThrow(rollbackErr);
      await expect(connection.rollBack).toHaveBeenCalled();
      await expect(releaseSpy).toHaveBeenCalled();
    });

    it('should call rollback on the connection, destroy it and reject when shouldCommit is false and a fatal rollback error occurred', async () => {
      const fatalErr = new Error();
      fatalErr.fatal = true;
      connection.rollBack = jest.fn((cb) => cb(fatalErr));
      const destroySpy = jest.spyOn(provider.pool, 'destroy');

      await expect(provider.exitTransaction(connection, false)).rejects.toThrow(fatalErr);
      await expect(connection.rollBack).toHaveBeenCalled();
      await expect(destroySpy).toHaveBeenCalled();
    });
  });
});
