angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerCtrl', function($scope, $state, settingsService) {
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
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerInputCtrl', function($scope, $state, settingsService) {
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
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerChooseReportCtrl', function($scope, $state, $stateParams, $timeout, settingsService) {
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
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerChooseFightCtrl', function($scope, $stateParams, $state, $timeout, settingsService) {
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
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerDownloadFightCtrl', function($scope, $state, $timeout, $stateParams) {
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
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerParseFightCtrl', function($scope, $state, $timeout, $stateParams, settingsService) {
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
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerResultCtrl', function($scope, $state, $timeout, $stateParams, settingsService) {
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
    });
