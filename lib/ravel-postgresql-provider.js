'use strict';

const Client = require('pg').Client;
const Pool = require('generic-pool').Pool;
const Ravel = require('ravel');

/**
 * Default options for node-PostgreSQL
 */
const DEFAULT_OPTIONS = {
  user: 'postgres',
  password: '',
  host: 'localhost',
  port: 5432,
  database: 'postgres'
};

/**
 * A Ravel DatabaseProvider for PostgreSQL
 * We use generic-pool instead of node-PostgreSQL's built-in pool
 * because it's more flexible and less completely insane when
 * it comes to timeouts.
 */
class PostgreSQLProvider extends Ravel.DatabaseProvider {
  /**
   * Construct a new PostgreSQLProvider.
   *
   * @param {Ravel} ravelInstance - An instance of a Ravel application.
   * @param {string} instanceName - The name to alias this PostgreSQLProvider under. 'postgresql' by default.
   */
  constructor (ravelInstance, instanceName = 'postgresql') {
    super(ravelInstance, instanceName);

    ravelInstance.registerParameter(`${instanceName} options`, true, DEFAULT_OPTIONS);
  }

  prelisten (ravelInstance) {
    // overlay user options onto defaults
    const opts = {};
    Object.assign(opts, DEFAULT_OPTIONS);
    Object.assign(opts, ravelInstance.get(`${this.name} options`));
    const pool = new Pool({
      name: `${this.name} pool`,
      create: function (callback) {
        const conn = new Client(opts);

        // monkeypatch in the pieces we need
        conn.begin = function (callback) {
          conn.query('BEGIN', (transactionErr) => {
            callback(transactionErr);
          });
        };

        conn.rollback = function (callback) {
          conn.query('ROLLBACK', (rollbackErr) => {
            callback(rollbackErr);
          });
        };

        conn.commit = function (callback) {
          conn.query('COMMIT', (commitErr) => {
            callback(commitErr);
          });
        };

        conn.connect((err) => {
          if (err) {
            callback(err, null);
          } else {
            callback(null, conn);
          }
        });
        // catch timeouts
        conn.on('error', () => {
          console.log('Catching error.');
          pool.destroy(conn);
        });
      },
      destroy: function (conn) {
        try { conn.end(); } catch (e) { /* don't worry about destroy failure */ }
      },
      // this doesn't seem to work properly yet. results in multiple destroys.
      // validateAsync: function(conn, callback) {
      //   conn.ping((err) => {
      //     try {callback(err?true:false);} catch(e) {/* don't worry about double destroys? */}
      //   });
      // },
      min: 2,
      max: opts.connectionLimit,
      idleTimeoutMillis: opts.idleTimeoutMillis
    });
    this.pool = pool;
  }

  end () {
    if (this.pool) {
      this.$log.trace('Draining the connection pool.');
      this.pool.drain(() => this.pool.destroyAllNow());
    }
  }

  release (connection, err) {
    // if we know this is a fatal error, don't return the connection to the pool
    if (err && err.fatal) {
      this.$log.trace('Destroying fatally-errored connection.');
      try { this.pool.destroy(connection); } catch (e) { /* don't worry about double destroys for now */ }
    } else {
      try { this.pool.release(connection); } catch (e) { /* don't worry about double releases for now */ }
    }
  }

  getTransactionConnection () {
    const self = this;
    return new Promise((resolve, reject) => {
      this.pool.acquire(function (connectionErr, connection) {
        if (connectionErr) {
          reject(connectionErr);
        } else {
          // begin transaction
          connection.begin((transactionErr) => {
            if (transactionErr) {
              transactionErr.fatal = true;
              reject(transactionErr);
              self.release(connection, transactionErr);
            } else {
              resolve(connection);
            }
          });
        }
      });
    });
  }

  exitTransaction (connection, shouldCommit) {
    const self = this;
    const log = this.$log;
    return new Promise((resolve, reject) => {
      if (!shouldCommit) {
        connection.rollback((rollbackErr) => {
          self.release(connection, rollbackErr);
          if (rollbackErr) {
            log.trace(rollbackErr);
            reject(rollbackErr);
          } else {
            resolve();
          }
        });
      } else {
        connection.commit((commitErr) => {
          if (commitErr) {
            log.trace(commitErr);
            if (!commitErr.fatal) {
              connection.rollback((rollbackErr) => {
                self.release(connection, rollbackErr);
                reject(rollbackErr || commitErr);
              });
            } else {
              self.release(connection, commitErr);
              reject(commitErr);
            }
          } else {
            self.release(connection);
            resolve();
          }
        });
      }
    });
  }
}

module.exports = PostgreSQLProvider;
