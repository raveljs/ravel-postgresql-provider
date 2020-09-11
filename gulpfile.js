'use strict';

const gulp = require('gulp');
const plugins = require('gulp-load-plugins')();
const del = require('del');

const babelConfig = {
  presets: [
    // {'retainLines': true} // broken in babel 7 with decorators
  ],
  'plugins': [['@babel/plugin-proposal-decorators', { 'legacy': true }]]
};

const TESTS = [
  'test-dist/test/test-ravel-postgresql-provider.js',
  'test-dist/test/test-integration.js'
];

gulp.task('lint', gulp.series(function lint() {
  return gulp.src(['./lib/**/*.js', './test/**/*.js', 'gulpfile.js'])
    .pipe(plugins.eslint())
    .pipe(plugins.eslint.format())
    .pipe(plugins.eslint.failAfterError());
}));

gulp.task('watch', gulp.parallel('lint'), gulp.series(function watch() {
  gulp.watch(['./lib/**/*.js'], ['lint']);
  gulp.watch(['gulpfile.js', './test/**/*.js'], ['lint']);
}));

gulp.task('clean', gulp.series(function clean() {
  return del([
    'reports', 'docs', 'test-dist'
  ]);
}));

gulp.task('show-coverage', gulp.series(function showCoverage () {
  return gulp.src('./coverage/lcov-report/index.html')
    .pipe(plugins.open());
}));

gulp.task('default', gulp.series('watch'));
