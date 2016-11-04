var gulp = require('gulp');
var ngAnnotate = require('gulp-ng-annotate');
var concat = require('gulp-concat');
var sass = require('gulp-sass');
var rename = require('gulp-rename');
var template = require('gulp-template');
var uglify = require('gulp-uglify');
var livereload = require('gulp-livereload');
var html2js = require('gulp-html2js');

var isLiveReload = process.argv.indexOf('--live-reload') !== -1 || process.argv.indexOf('--livereload') !== -1;

gulp.task('templates:index', ['js', 'sass'], function() {
    return gulp.src("./web/src/index.html")
        .pipe(template({}))
        .pipe(gulp.dest("./web/www"));
});

gulp.task('templates:rest', function() {

    return gulp.src("./web/src/templates/**/*")
        .pipe(gulp.dest("./web/www/templates"))
        ;
});

gulp.task('js:libs', function() {

    return gulp.src([
        "./web/src/lib/q/q.js",
        "./web/src/lib/angular/angular.js",
        "./web/src/lib/angular-ui-router/release/angular-ui-router.js"
    ])
        .pipe(concat('libs.js'))
        .pipe(gulp.dest('./web/www/js/'));
});

gulp.task('js:app', function() {

    return gulp.src([
        './web/src/js/**/*.js'
    ])
        .pipe(concat('app.js'))
        .pipe(ngAnnotate())
        .pipe(gulp.dest('./web/www/js/'));
});

// create a sass with and without dependancy on fontello
gulp.task('sass', function() {

    return gulp.src('./web/src/sass/app.scss')
        .pipe(sass({errLogToConsole: true}))
        .pipe(gulp.dest('./web/www/css/'));
});

gulp.task('copyfonts', function() {

    return gulp.src(['./web/src/font/*', './web/src/font/**/*'])
        .pipe(gulp.dest('./web/www/font'));
});

gulp.task('copyimages', function() {

    return gulp.src(['./web/src/img/*', './web/src/img/**/*'])
        .pipe(gulp.dest('./web/www/img'));
});

gulp.task('copystatics', ['copyfonts', 'copyimages']);

gulp.task('watch', function() {
    if (isLiveReload) {
        livereload.listen();
    }

    gulp.watch(['./web/src/sass/**/*.scss'], ['sass:livereload']);
    gulp.watch(['./web/src/img/**/*', './web/src/font/**/*'], ['copystatics:livereload']);
    gulp.watch(['./web/src/js/**/*.js'], ['js:app:livereload']);
    gulp.watch(['./web/src/templates/**/*', './web/src/translations/translations/**/*', './web/src/index.html'], ['templates:livereload']);
});

gulp.task('js:app:livereload', ['js:app'], function() {
    livereload.reload();
});

gulp.task('templates:livereload', ['templates'], function() {
    livereload.reload();
});

gulp.task('default:livereload', ['default'], function() {
    livereload.reload();
});

gulp.task('copystatics:livereload', ['copystatics'], function() {
    livereload.reload();
});

gulp.task('js', ['js:libs', 'js:app']);
gulp.task('templates', ['templates:index', 'templates:rest']);
gulp.task('default', ['copystatics', 'sass', 'templates', 'js']);
