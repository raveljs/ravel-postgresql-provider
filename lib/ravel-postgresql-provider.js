'use strict';

const { Pool } = require('pg');
const Ravel = require('ravel');

const sPool = Symbol.for('_pool');

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

    this[sPool] = new Pool(opts);
  }

  end () {
    if (this[sPool]) {
      this.$log.trace('Draining the connection pool.');
      this[sPool].end();
      delete this[sPool];
    }
  }

  acquire () {
    return new Promise((resolve, reject) => {
      this[sPool].connect((err, client) => {
        if (err) {
          return reject(err);
        } else {
          return resolve(client);
        }
      });
    });
  }

  release (connection, err) {
    // if we know this is a fatal error, don't return the connection to the pool
    if (err && err.fatal) {
      this.$log.trace('Destroying fatally-errored connection.');
      try { connection.release(true); } catch (e) { /* don't worry about double destroys for now */ }
    } else {
      try { connection.release(); } catch (e) { /* don't worry about double releases for now */ }
    }
  }

  async getTransactionConnection () {
    // acquire connection
    const connection = await this.acquire();
    // attempt to begin a transaction
    try {
      await connection.query('BEGIN');
      return connection;
    } catch (beginErr) {
      console.error(beginErr);
      this.$log.trace(beginErr);
      // if we fail to start a transaction, destroy the connection
      beginErr.fatal = true;
      this.release(connection, beginErr);
      throw beginErr;
    }
  }

  async exitTransaction (connection, shouldCommit) {
    if (!shouldCommit) {
      try {
        await connection.query('ROLLBACK');
        this.release(connection, null);
      } catch (rollbackErr) {
        this.$log.trace(rollbackErr);
        this.release(connection, rollbackErr);
        throw rollbackErr;
      }
    } else {
      try {
        await connection.query('COMMIT');
        this.release(connection, null);
      } catch (commitErr) {
        this.$log.trace(commitErr);
        // if we failed to commit, and that failure wasn't fatal, we should try to rollback
        if (!commitErr.fatal) {
          return this.exitTransaction(connection, false);
        } else {
          this.release(connection, commitErr);
          throw commitErr;
        }
      }
    }
  }
}

module.exports = PostgreSQLProvider;
