angular.module('rdruid-mastery', [
    'ui.router'
]);

angular.module('rdruid-mastery').run(
    ["$rootScope", "$state", "$log", function($rootScope, $state, $log) {
        // used to invalidate old parser results
        $rootScope.RESULTS_VERSION = 'v1.0.0';

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
            .state('app.mastery-analyzer', {
                abstract: true,
                templateUrl: "templates/mastery-analyzer/index.html",
                url: "/mastery-analyzer",
                controller: "MasteryAnalyzerCtrl",
                resolve: {
                    settingsServiceLoaded: ["settingsService", function(settingsService) {
                        return settingsService.$isLoaded();
                    }]
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
            .state('app.mastery-analyzer.download-fight', {
                url: "/download-fight?reportID&fightID",
                controller: "MasteryAnalyzerDownloadFightCtrl",
                templateUrl: "templates/mastery-analyzer/download-fight.html"
            })
            .state('app.mastery-analyzer.parse-fight', {
                url: "/parse-fight?reportID&fightID",
                controller: "MasteryAnalyzerParseFightCtrl",
                templateUrl: "templates/mastery-analyzer/parse-fight.html"
            })
            .state('app.mastery-analyzer.result', {
                url: "/result?reportID&fightID",
                controller: "MasteryAnalyzerResultCtrl",
                templateUrl: "templates/mastery-analyzer/result.html"
            })
        ;

        // if none of the above states are matched, use this as the fallback
        $urlRouterProvider.otherwise('/mastery-analyzer/');
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

angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerCtrl', ["$scope", "$state", "settingsService", function($scope, $state, settingsService) {
        $scope.state = {
            reportID: "",
            character: "",
            apikey: "",
            fightID: null,
            fight: null,
            actorID: null,
            friendlies: null,
            ignoreFriendliesRaw: null,
            ignoreFriendlies: {},
            events: null,
            parser: null
        };

        $scope.state.apikey = settingsService.apikey;
        $scope.state.character = settingsService.character;

        var requestcache = rdruidMastery.leveldb('./requestcache.leveldb');
        var _wclapi = null;
        $scope.wclapi = function() {
            if (!_wclapi) {
                _wclapi = new rdruidMastery.WCLAPI($scope.state.apikey, requestcache);
            }

            return _wclapi;
        };

        $scope.gotoInput = function() {
            $scope.state.reportID = null;
            $scope.state.fightID = null;
            $scope.state.fight = null;
            $scope.state.actorID = null;
            $scope.state.events = null;
            $scope.state.friendlies = null;
            $scope.state.parser = null;

            $state.go('app.mastery-analyzer.input');
        };

        $scope.gotoChooseReport = function() {
            $scope.state.reportID = null;
            $scope.state.fightID = null;
            $scope.state.fight = null;
            $scope.state.actorID = null;
            $scope.state.events = null;
            $scope.state.friendlies = null;
            $scope.state.parser = null;

            $state.go('app.mastery-analyzer.choose-report');
        };

        $scope.gotoChooseFight = function() {
            $scope.state.fightID = null;
            $scope.state.fight = null;
            $scope.state.actorID = null;
            $scope.state.events = null;
            $scope.state.friendlies = null;
            $scope.state.parser = null;

            $state.go('app.mastery-analyzer.choose-fight', {
                reportID: $scope.state.reportID
            });
        };
        
        $scope.reportFightID = function(fightID, reportID) {
            reportID = reportID || $scope.state.reportID;
            fightID = fightID || ($scope.state.fight && $scope.state.fight.id) || $scope.state.fightID;
            if (!reportID || !fightID) {
                throw new Error();
            }
            
            return reportID + ":" + fightID;
        };

        $scope.findFight = function(reportID, fightID) {
            reportID = reportID || $scope.state.reportID;
            fightID = fightID|| $scope.state.fightID;

            return $scope.wclapi().getFights(reportID)
                .then(function(fights) {
                    // find the fight
                    var fight = fights.filter(function(fight) {
                        return fight.id == fightID;
                    });

                    if (fight.length !== 1) {
                        throw new Error("fightID not found");
                    }

                    return fight[0];
                })
        };

        $scope.chooseFight = function(fight, reportID) {
            reportID = reportID || $scope.state.reportID;
            if (typeof settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightID(fight.id, reportID)] !== "undefined") {
                $state.go('app.mastery-analyzer.result', {
                    reportID: reportID,
                    fightID: fight.id
                });
            } else {
                $state.go('app.mastery-analyzer.download-fight', {
                    reportID: reportID,
                    fightID: fight.id
                });
            }
        };

        $scope.checkState = function($stateParams) {
            $stateParams = $stateParams || {};

            if (!$scope.state.apikey || !$scope.state.character) {
                $state.go('app.mastery-analyzer.input');
                return false;
            }

            if (!$scope.state.reportID && $stateParams.reportID) {
                $scope.state.reportID = $stateParams.reportID;
            }

            if (!$scope.state.reportID) {
                if ($state.is('app.mastery-analyzer.choose-report')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.choose-report');
                    return false;
                }
            }

            if (!$scope.state.fightID && $stateParams.fightID) {
                $scope.state.fightID = $stateParams.fightID;
            }

            if (!$scope.state.fightID) {
                if ($state.is('app.mastery-analyzer.choose-fight')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.choose-fight');
                    return false;
                }
            }

            if (typeof settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightID()] !== "undefined") {
                if ($state.is('app.mastery-analyzer.result')) {
                    return true;
                }
            }

            if (!$scope.state.fight || !$scope.state.events || !$scope.state.actorID) {
                if ($state.is('app.mastery-analyzer.download-fight')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.download-fight');
                    return false;
                }
            }

            if (!$scope.state.parser) {
                if ($state.is('app.mastery-analyzer.parse-fight')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.parse-fight');
                    return false;
                }
            }

            return true;
        }
    }]);


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerInputCtrl', ["$scope", "$state", "settingsService", function($scope, $state, settingsService) {
        $scope.continue = function() {
            if (!$scope.state.apikey || !$scope.state.character) {
                alert('NEED MORE DETAILS');
                return;
            }

            settingsService.apikey = $scope.state.apikey;
            settingsService.character = $scope.state.character;

            settingsService.$store()
                .then(function() {
                    $state.go('app.mastery-analyzer.choose-report');
                }).catch(function(e) {
                    alert(e);
                });
        };
    }]);


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerChooseReportCtrl', ["$scope", "$state", "$stateParams", "$timeout", "settingsService", function($scope, $state, $stateParams, $timeout, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        $scope.onlyBosses = true;
        $scope.onlyKills = false;
        $scope.reports = settingsService.reports || [];
        $scope.loading = false;

        $scope.reports.forEach(function(report) {
            $scope.wclapi().getFights(report.id).then(
                function(fights) {
                    $timeout(function() {
                        report.fights = fights.filter(function(fight) {
                            return (typeof settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightID(fight.id, report.id)] !== "undefined");
                        });
                    });
                });
        });

        $scope.addReport = function(reportID) {
            var m = reportID.match(/reports\/([a-zA-Z0-9]+)/);
            if (m) {
                reportID = m[1];
            }

            if (!reportID.match(/^[a-zA-Z0-9]+$/)) {
                alert("This is not a valid reportID");
                return;
            }

            var report = {id: reportID, name: reportID};

            settingsService.reports = settingsService.reports || [];
            settingsService.reports.push(report);

            return settingsService.$store().then(function() {
                return $scope.chooseReport(report);
            });
        };

        $scope.chooseReport = function(report) {
            return $state.go('app.mastery-analyzer.choose-fight', {
                reportID: report.id
            });
        };
    }]);


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerChooseFightCtrl', ["$scope", "$stateParams", "$state", "$timeout", "settingsService", function($scope, $stateParams, $state, $timeout, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        $scope.onlyBosses = true;
        $scope.onlyKills = false;
        $scope.loading = true;
        $scope.fights = [];

        $scope.wclapi().getFights($scope.state.reportID).then(
            function(fights) {
                fights.forEach(function(fight) {
                    fight.hasResults = (typeof settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightID(fight.id, $scope.state.reportID)] !== "undefined");
                });

                $timeout(function() {
                    $scope.fights = fights;
                    $scope.loading = false;
                });
            },
            function(e) {
                alert("" + e);
            }
        );
    }]);


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerDownloadFightCtrl', ["$scope", "$state", "$timeout", "$stateParams", function($scope, $state, $timeout, $stateParams) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        var wclapi = $scope.wclapi();

        wclapi.getFights($scope.state.reportID)
            .then(function(fights) {
                // find the fight
                var fight = fights.filter(function(fight) {
                    return fight.id == $scope.state.fightID;
                });

                if (fight.length !== 1) {
                    throw new Error("fightID not found");
                }

                return fight[0];
            })
            .then(function(fight) {
                $scope.state.fight = fight;

                return wclapi.getFriendlies($scope.state.reportID)
                    .then(function(friendlies) {
                        $scope.state.friendlies = friendlies;
                    })
                    .then(function() {
                        // we need the actorID instead of the name
                        return wclapi.getActorID($scope.state.reportID, $scope.state.character)
                            .then(function(actorID) {
                                $scope.state.actorID = actorID;

                                // get all events
                                return wclapi.getEvents($scope.state.reportID, $scope.state.actorID, fight.start_time, fight.end_time)
                                    .then(function(events) {

                                        $scope.state.events = events;

                                        $state.go('app.mastery-analyzer.parse-fight', {
                                            reportID: $scope.state.reportID,
                                            fightID: fight.id
                                        });
                                    })
                            });
                    });
            })
            .fail(function(e) {
                alert("" + e);
            });
    }]);


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerParseFightCtrl', ["$scope", "$state", "$timeout", "$stateParams", "settingsService", function($scope, $state, $timeout, $stateParams, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        $scope.loading = true;
        $scope.parsing = false;

        $scope.continueInputFriendlies = function() {
            console.log($scope.state.ignoreFriendliesRaw);

            $scope.state.ignoreFriendlies[$scope.reportFightID()] = [];
            Object.keys($scope.state.ignoreFriendliesRaw).forEach(function(friendlyId) {
                if ($scope.state.ignoreFriendliesRaw[friendlyId]) {
                    $scope.state.ignoreFriendlies[$scope.reportFightID()].push(friendlyId);
                }
            });

            if (settingsService.ignoreFriendlies instanceof Array) {
                settingsService.ignoreFriendlies = {};
            }
            settingsService.ignoreFriendlies[$scope.reportFightID()] = $scope.state.ignoreFriendlies[$scope.reportFightID()];

            return settingsService.$store().then(function() {
                return $scope.parse();
            });
        };

        $scope.parse = function() {
            $scope.state.parser = new rdruidMastery.Parser($scope.state.fight, $scope.state.actorID, $scope.state.friendlies, $scope.state.events, $scope.state.ignoreFriendlies[$scope.reportFightID()] || []);

            $timeout(function() {
                $scope.loading = false;
                $scope.parsing = true;
                $scope.state.parser.parse();

                settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightID()] = {
                    masteryStacks: $scope.state.parser.masteryStacks
                };

                settingsService.$store().then(function() {
                    $state.go('app.mastery-analyzer.result', {
                        reportID: $scope.state.reportID,
                        fightID: $scope.state.fight.id
                    });
                });

            });
        };

        if ($scope.state.fight.boss === 1854) {
            $scope.inputFriendlies = true;
            $scope.state.ignoreFriendlies[$scope.reportFightID()] = settingsService.ignoreFriendlies[$scope.reportFightID()] || [];
            $scope.state.ignoreFriendliesRaw = {};
            $scope.state.ignoreFriendlies[$scope.reportFightID()].forEach(function(friendlyID) {
                $scope.state.ignoreFriendliesRaw[friendlyID] = true;
            });

            $scope.wclapi().getFriendlies($scope.state.reportID)
                .then(function(friendlies) {
                    $timeout(function() {
                        $scope.friendlies = friendlies.filter(function(friendly) {
                            return !friendly.petOwner;
                        });

                        $scope.loading = false;
                    });
                });
        } else {
            $scope.parse();
        }
    }]);


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerResultCtrl', ["$scope", "$state", "$timeout", "$stateParams", "settingsService", function($scope, $state, $timeout, $stateParams, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        var masteryStacks;
        if ($scope.state.parser && $scope.state.parser.masteryStacks) {
            masteryStacks = $scope.state.parser.masteryStacks;
        } else if (typeof settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightID()] !== "undefined") {
            masteryStacks = settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightID()].masteryStacks;
            $scope.findFight().then(function(fight) {
                $timeout(function() {
                    $scope.state.fight = fight;
                });
            });
        } else {
            throw new Error();
        }

        var table = [];

        // sum up the total HoT time
        var total = 0;
        for (var i = 1; i <= rdruidMastery.Parser.MAX_HOTS; i++) {
            total += masteryStacks[i];
        }

        // weighted time (for avg HoTs calc)
        var avgsum = 0;
        // cummulative time
        var cummul = 0;

        // loop from high to low
        for (var i = rdruidMastery.Parser.MAX_HOTS; i > 0; i--) {
            var stacks = i;
            var time = masteryStacks[stacks];

            // add time to cummulative time
            cummul += time;

            // add time to weighted time
            avgsum += (stacks * time);

            // don't start printing until we have something to print
            if (cummul > 0) {
                table.push({
                    stacks: stacks,
                    time: (time / 1000),
                    percentage: (time / total * 100),
                    ctime: (cummul / 1000),
                    cpercentage: (cummul / total * 100)
                });
            }
        }

        $scope.table = table;
        $scope.avghots = (avgsum / total);
    }]);

angular.module('rdruid-mastery').service('settingsService', ["$rootScope", "$q", function($rootScope, $q) {
    var defaults = {
        apikey: "",
        character: "",
        reports: [],
        results: {},
        ignoreFriendlies: {}
    };
    angular.extend(this, defaults);

    var STORAGEID = "settings";

    var storage = rdruidMastery.leveldb('./settings.leveldb');

    var normalizeVersion = function(v) {
        return parseInt(v.match(/^v(\d)\.(\d)\.(\d)$/).map(function(v) {
            return ("00" + v).slice(-2);
        }).join(""), 10);
    };

    this._$isLoaded = null;
    /**
     * returns a promise to get the data, does not force update
     * @returns {null|*}
     */
    this.$isLoaded = function() {
        if (!this._$isLoaded) {
            this._$isLoaded = this.$load();
        }

        return this._$isLoaded;
    };

    /**
     * load the data from the database
     * @returns {*}
     */
    this.$load = function() {
        var self = this;

        var defer = $q.defer();

        storage.get(STORAGEID, function(err, doc) {
            if (err) {
                if (err.type === "NotFoundError") {
                    doc = null;
                } else {
                    defer.reject(err);
                    return;
                }
            }

            defer.resolve(doc);
        });

        return defer.promise.then(
            function(doc) {
                try {
                    doc = JSON.parse(doc);
                } catch (e) {
                    doc = null;
                }

                doc = doc || {};

                //update each of the values as defined in the defaults array
                angular.forEach(defaults, function(value, key) {
                    if (typeof doc[key] !== "undefined") {
                        self[key] = doc[key];
                    } else {
                        self[key] = defaults[key];
                    }
                });

                self.results[$rootScope.RESULTS_VERSION] = self.results[$rootScope.RESULTS_VERSION] || {};

                var currentVersion = normalizeVersion($rootScope.RESULTS_VERSION);
                var storeCleanedResults = false;
                Object.keys(self.results).forEach(function(_version) {
                    var version = normalizeVersion(_version);

                    if (version < currentVersion) {
                        delete self.results[_version];
                        storeCleanedResults = true;
                    }
                });

                if (storeCleanedResults) {
                    return settingsService.$store();
                }
            },
            function(e) { alert(e); throw e; }
        );
    };

    /**
     * update database copy of the data
     * @returns {*}     promise
     */
    this.$store = function() {
        var self = this;

        var defer = $q.defer();

        storage.get(STORAGEID, function(err, doc) {
            if (err) {
                if (err.type === "NotFoundError") {
                    doc = null;
                } else {
                    defer.reject(err);
                    return;
                }
            }

            defer.resolve(doc);
        });

        return defer.promise.then(
            function(doc) {
                try {
                    doc = JSON.parse(doc);
                } catch (e) {
                    doc = null;
                }

                doc = doc || {};

                //update each of the values as defined in the defaults array
                angular.forEach(defaults, function(value, key) {
                    doc[key] = self[key];
                });

                var defer = $q.defer();

                storage.put(STORAGEID, JSON.stringify(doc), function(err) {
                    if (err) {
                        defer.reject(err);
                        return;
                    }

                    defer.resolve();
                });

                return defer.promise;
            })
            .catch(function(e) { alert(e); throw e; });
    };
}]);