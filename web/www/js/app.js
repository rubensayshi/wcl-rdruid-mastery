angular.module('rdruid-mastery', [
    'ui.router'
]);

angular.module('rdruid-mastery').run(
    ["$rootScope", "$state", "$log", function($rootScope, $state, $log) {

        $rootScope.bodyClass = [];

        $rootScope.$on("$stateChangeError", function(event, toState, toParams, fromState, fromParams, error) {
            $log.error('Error transitioning to '+toState.name + ' from  '+fromState.name, toState, fromState, error);
            event.preventDefault();
        });

        //--- Debugging info ---
        $rootScope.$on("$stateChangeStart", function(event, toState, toParams, fromState, fromParams) {
            $log.debug("$stateChangeStart", toState.name, Object.keys(toParams).map(function(k) { return k + ":" + toParams[k]; }));
        });

        $rootScope.$on("$stateChangeSuccess", function(event, toState, toParams, fromState, fromParams) {
            $log.debug("$stateChangeSuccess", toState.name, Object.keys(toParams).map(function(k) { return k + ":" + toParams[k]; }));

            var name;

            name = [];
            fromState.name.split('.').forEach(function(part) {
                name.push(part);
                var idx = $rootScope.bodyClass.indexOf('state-' + name.join("_"));
                if (idx !== -1) {
                    $rootScope.bodyClass.splice(idx, 1);
                }
            });

            name = [];
            toState.name.split('.').forEach(function(part) {
                name.push(part);
                $rootScope.bodyClass.push('state-' + name.join("_"));
            });

            $rootScope.bodyClassStr = $rootScope.bodyClass.join(" ");
        });

        $rootScope.$on("$stateChangeError", function(event, toState, toParams, fromState, fromParams) {
            $log.debug("$stateChangeError", toState.name, Object.keys(toParams).map(function(k) { return k + ":" + toParams[k]; }));
        });
    }]
);

angular.module('rdruid-mastery').config(
    ["$compileProvider", "$stateProvider", "$urlRouterProvider", "$logProvider", "$sceDelegateProvider", function($compileProvider, $stateProvider, $urlRouterProvider, $logProvider, $sceDelegateProvider) {
        $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|tel|file|bitcoin):/);
        $logProvider.debugEnabled(true);

        var urlWhitelist = ['self'];

        $sceDelegateProvider.resourceUrlWhitelist(urlWhitelist);

        $stateProvider
            .state('app', {
                abstract: true,
                templateUrl: "templates/common/base.html"
            })
            .state('app.homepage', {
                url: "/",
                controller: "HomepageCtrl",
                templateUrl: "templates/homepage.html"
            })
        ;

        // if none of the above states are matched, use this as the fallback
        $urlRouterProvider.otherwise('/');
    }]
);

// patching ES6 Promises :/
if (typeof Promise !== "undefined") {
    Promise.prototype.done = function() {
        return this.then(
            function(r) {
                return r;
            },
            function(e) {
                setTimeout(function() {
                    throw e;
                });
            }
        );
    };
}

if (!Array.prototype.unique) {
    Array.prototype.unique = function() {
        return this.filter(function onlyUnique(value, index, self) {
            return value && self.indexOf(value) === index;
        });
    };
}

if (!Array.prototype.any) {
    Array.prototype.any = function(fn) {
        var match = null;

        this.forEach(function(value, index) {
            if (!match && fn(value, index)) {
                match = value;
            }
        });

        return match;
    };
}

if (!Array.prototype.clean) {
    Array.prototype.clean = function() {
        return this.filter(function onlyNotNull(value) {
            return value;
        });
    };
}

if (!Array.prototype.last) {
    Array.prototype.last = function() {
        return this[this.length - 1];
    };
}

if (!Array.prototype.sample) {
    Array.prototype.sample = function(size) {
        var shuffled = this.slice(0), i = this.length, temp, index;

        while (i--) {
            index = Math.floor((i + 1) * Math.random());
            temp = shuffled[index];
            shuffled[index] = shuffled[i];
            shuffled[i] = temp;
        }

        return shuffled.slice(0, size);
    };
}

if (!window.repeat) {
    window.repeat = function(n, fn) {
        var r = [];
        for (var i = 0; i < n; i++) {
            r.push(fn(i));
        }

        return r;
    };
}
