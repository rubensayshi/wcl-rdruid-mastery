angular.module('rdruid-mastery', [
    'ui.router'
]);

angular.module('rdruid-mastery').run(
    function($rootScope, $state, $log) {
        // used to invalidate old parser results
        $rootScope.RESULTS_VERSION = 'v1.2.0';
        $rootScope.STORE_RESULTS = false;
        $rootScope.CONSTS = rdruidMastery.consts;

        // use to modify the class on the <body>
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
    }
);

angular.module('rdruid-mastery').config(
    function($compileProvider, $stateProvider, $urlRouterProvider, $logProvider, $sceDelegateProvider) {
        $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|tel|file|bitcoin):/);
        $logProvider.debugEnabled(true);

        var urlWhitelist = ['self'];

        $sceDelegateProvider.resourceUrlWhitelist(urlWhitelist);

        $stateProvider
            .state('app', {
                abstract: true,
                templateUrl: "templates/common/base.html"
            })
            .state('app.mastery-analyzer', {
                abstract: true,
                templateUrl: "templates/mastery-analyzer/index.html",
                url: "/mastery-analyzer",
                controller: "MasteryAnalyzerCtrl",
                resolve: {
                    settingsServiceLoaded: function(settingsService) {
                        return settingsService.$isLoaded();
                    }
                }
            })
            .state('app.mastery-analyzer.input', {
                url: "/",
                controller: "MasteryAnalyzerInputCtrl",
                templateUrl: "templates/mastery-analyzer/input.html"
            })
            .state('app.mastery-analyzer.choose-report', {
                url: "/choose-report",
                controller: "MasteryAnalyzerChooseReportCtrl",
                templateUrl: "templates/mastery-analyzer/choose-report.html"
            })
            .state('app.mastery-analyzer.choose-fight', {
                url: "/choose-fight?reportID",
                controller: "MasteryAnalyzerChooseFightCtrl",
                templateUrl: "templates/mastery-analyzer/choose-fight.html"
            })
            .state('app.mastery-analyzer.choose-character', {
                url: "/choose-character?reportID&fightID",
                controller: "MasteryAnalyzerChooseCharacterCtrl",
                templateUrl: "templates/mastery-analyzer/choose-character.html"
            })
            .state('app.mastery-analyzer.download-fight', {
                url: "/download-fight?reportID&fightID&actorID",
                controller: "MasteryAnalyzerDownloadFightCtrl",
                templateUrl: "templates/mastery-analyzer/download-fight.html"
            })
            .state('app.mastery-analyzer.parse-fight', {
                url: "/parse-fight?reportID&fightID&actorID",
                controller: "MasteryAnalyzerParseFightCtrl",
                templateUrl: "templates/mastery-analyzer/parse-fight.html"
            })
            .state('app.mastery-analyzer.result', {
                url: "/result?reportID&fightID&actorID",
                controller: "MasteryAnalyzerResultCtrl",
                templateUrl: "templates/mastery-analyzer/result.html"
            })
        ;

        // if none of the above states are matched, use this as the fallback
        $urlRouterProvider.otherwise('/mastery-analyzer/');
    }
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
