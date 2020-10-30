# ravel-postgresql-provider

> Ravel DatabaseProvider for postgresql

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/raveljs/ravel-postgresql-provider/main/LICENSE) [![npm version](https://badge.fury.io/js/ravel-postgresql-provider.svg)](http://badge.fury.io/js/ravel-postgresql-provider) [![Dependency Status](https://david-dm.org/raveljs/ravel-postgresql-provider.svg)](https://david-dm.org/raveljs/ravel-postgresql-provider) [![npm](https://img.shields.io/npm/dm/ravel.svg?maxAge=2592000)](https://www.npmjs.com/package/ravel) [![Build Status](https://travis-ci.org/raveljs/ravel-postgresql-provider.svg?branch=main)](https://travis-ci.org/raveljs/ravel-postgresql-provider) [![Test Coverage](https://codeclimate.com/github/raveljs/ravel-postgresql-provider/badges/coverage.svg)](https://codeclimate.com/github/raveljs/ravel-postgresql-provider/coverage)

`ravel-postgresql-provider` is a `DatabaseProvider` for Ravel, wrapping the powerful node [postgresql](https://github.com/postgresqljs/postgresql) library. It supports connection pooling as well as Ravel's [transaction system](http://raveljs.github.io/docs/latest/db/decorators/transaction.js.html) (including rollbacks).

## Example usage:

### Step 1: Import and instantiate the PostgreSQL provider

*app.js*
```javascript
const app = new require('ravel')();
const postgresqlProvider = require('ravel-postgresql-provider');
new postgresqlProvider(app);
// ... other providers and parameters
app.modules('./modules');
app.resources('./resources');
// ... the rest of your Ravel app
app.init();
app.listen();
```

### Step 2: Access connections via `@transaction`

*resources/posts_resource.js*
```javascript
const Ravel = require('ravel');
const inject = Ravel.inject;
const Resource = Ravel.Resource;
const transaction = Resource.transaction;

@inject('posts')
class PostsResource extends Resource {
  constructor(posts) {
    super('/posts');
    this.posts = posts;
  }

  /**
   * Retrieve a single post
   */
  @transaction('postgresql')
  get(ctx) {
    // Best practice is to pass the transaction object through to a Module, where you handle the actual business logic.
    return this.posts.getPost(ctx.transaction, ctx.params.id)
    .then((posts) => {
      ctx.body = posts;
    });
  }
}
```

### Step 3: Use connections to perform queries

*modules/posts.js*
```javascript
const Ravel = require('ravel');
const Module = Ravel.Module;

class Posts extends Module {
  getPost(transaction, id) {
    return new Promise((resolve, reject) => {
      const postgresql = transaction['postgresql'];
      // for more information about the postgresql connection's capabilities, visit the docs: https://github.com/postgresqljs/postgresql
      postgresql.query(
        `SELECT * from posts WHERE \`id\` = ?`,
        [id],
        (err, results) => {
          if (err) { return reject(err); }
          resolve(results);
        }
      );
    });
  }
}
```

### Step 4: Configuration

Requiring the `ravel-postgresql-provider` module will register a configuration parameter with Ravel which must be supplied via `.ravelrc` or `app.set()`. This configuration parameter matches the format defined by `pg` for [Pools](https://node-postgres.com/api/pool):

*.ravelrc*
```json
{
  "postgresql options": {
    "host": "localhost",
    "port": 5432,
    "user": "my_user",
    "password": "a password",
    "database": "my_database",
    "connectionTimeoutMillis": 5000,
    "idleTimeoutMillis": 5000,
    "max": 10
  }
}
```

All options for a `node-postres` connection are supported, and are documented [here](https://node-postgres.com/api/client).

## Additional Notes

### Multiple Simultaneous Providers

`ravel-postgresql-provider` also supports multiple simultaneous pools for different postgresql databases, as long as you name them:

*app.js*
```javascript
const app = new require('ravel')();
const postgresqlProvider = require('ravel-postgresql-provider');
new postgresqlProvider(app, 'first postgresql');
new postgresqlProvider(app, 'second postgresql');
// ... other providers and parameters
app.init();
// ... the rest of your app
```

*.ravelrc*
```json
{
  "first postgresql options": {
    "host": "localhost",
    "port": 5432,
    "user": "ravel",
    "password": "a password",
    "database": "myfirstdatabase",
    "connectionTimeoutMillis": 5000,
    "idleTimeoutMillis": 5000,
    "max": 10
  },
  "second postgresql options": {
    "host": "localhost",
    "port": 5432,
    "user": "ravel",
    "password": "another password",
    "database": "myseconddatabase",
    "connectionTimeoutMillis": 5000,
    "idleTimeoutMillis": 5000,
    "max": 10
  }
}
```

*resources/posts_resource.js*
```javascript
const Ravel = require('ravel');
const Resource = Ravel.Resource;
const transaction = Resource.transaction;

class PostsResource extends Resource {
  // ...
  @transaction('first postgresql', 'second postgresql')
  get(ctx) {
    // can use ctx.transaction['first postgresql']
    // and ctx.transaction['second postgresql']
  }
}
```
