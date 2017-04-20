angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerCtrl', function($scope, $state, settingsService, $timeout) {
        $scope.state = {
            reportID: "",
            character: "",
            apikey: "",
            fightID: null,
            fight: null,
            actorID: null,
            actorName: null,
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

        $scope.gotoChooseCharacter = function() {
            $scope.state.actorID = null;
            $scope.state.events = null;
            $scope.state.friendlies = null;
            $scope.state.parser = null;

            $state.go('app.mastery-analyzer.choose-character', {
                reportID: $scope.state.reportID,
                fightID: $scope.state.fightID
            });
        };
        
        $scope.reportFightActorID = function(actorID, fightID, reportID) {
            actorID = actorID || $scope.state.actorID;
            fightID = fightID || ($scope.state.fight && $scope.state.fight.id) || $scope.state.fightID;
            reportID = reportID || $scope.state.reportID;
            if (!reportID || !fightID) {
                throw new Error();
            }
            
            return reportID + ":" + fightID + ":" + actorID;
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

        $scope.findActor = function(reportID, fightID, actorID) {
            reportID = reportID || $scope.state.reportID;
            fightID = fightID || $scope.state.fightID;
            actorID = actorID || $scope.state.actorID;

            return $scope.wclapi().getFriendlies(reportID)
                .then(function(friendlies) {
                    // find the fight
                    var friendly = friendlies.filter(function(friendly) {
                        return friendly.id == actorID;
                    });

                    if (friendly.length !== 1) {
                        throw new Error("actorID not found");
                    }

                    return friendly[0];
                })
        };

        $scope.chooseFight = function(fight, reportID) {
            reportID = reportID || $scope.state.reportID;
            $state.go('app.mastery-analyzer.choose-character', {
                reportID: reportID,
                fightID: fight.id
            });
        };

        $scope.chooseFriendly = function(friendly, fightID, reportID) {
            var actorID = friendly.id;
            fightID = fightID || $scope.state.fightID;
            reportID = reportID || $scope.state.reportID;

            if (typeof settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightActorID(actorID, fightID, reportID)] !== "undefined") {
                $state.go('app.mastery-analyzer.result', {
                    reportID: reportID,
                    fightID: fightID,
                    actorID: actorID
                });
            } else {
                $state.go('app.mastery-analyzer.download-fight', {
                    reportID: reportID,
                    fightID: fightID,
                    actorID: actorID
                });
            }
        };

        $scope.checkState = function($stateParams) {
            $stateParams = $stateParams || {};

            if (!$scope.state.apikey) {
                $state.go('app.mastery-analyzer.input');
                return false;
            }

            if ($stateParams.reportID) {
                $scope.state.reportID = $stateParams.reportID;
            }

            if ($stateParams.fightID) {
                $scope.state.fightID = parseInt($stateParams.fightID);
            }

            if ($stateParams.actorID) {
                $scope.state.actorID = parseInt($stateParams.actorID);
            }

            if ($scope.state.reportID) {
                if (settingsService.reports.map(function(report) { return report.id; }).indexOf($scope.state.reportID) === -1) {
                    var report = {id: $scope.state.reportID, name: $scope.state.reportID, fightsWithResults: {}};

                    settingsService.reports = settingsService.reports || [];
                    settingsService.reports.push(report);

                    settingsService.$store();
                }
            }

            if ($scope.state.fightID) {
                $scope.findFight().then(function(fight) {
                    $timeout(function() {
                        $scope.state.fight = fight;
                    });
                });
            }
            if ($scope.state.actorID) {
                $scope.findActor().then(function(actor) {
                    $timeout(function() {
                        $scope.state.actorName = actor.name;
                    });
                });
            }

            if (!$scope.state.reportID) {
                if ($state.is('app.mastery-analyzer.choose-report')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.choose-report');
                    return false;
                }
            }

            if (!$scope.state.fightID) {
                if ($state.is('app.mastery-analyzer.choose-fight')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.choose-fight');
                    return false;
                }
            }

            if (!$scope.state.actorID) {
                if ($state.is('app.mastery-analyzer.choose-character')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.choose-character');
                    return false;
                }
            }

            if (typeof settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightActorID()] !== "undefined") {
                if ($state.is('app.mastery-analyzer.result')) {
                    return true;
                } else {
                    $state.go('app.mastery-analyzer.result');
                    return false;
                }
            }

            if (!$scope.state.fight || !$scope.state.events) {
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
        };

        $scope.logout = function() {
            rdruidMastery.leveljs.destroy(settingsService.storage.db);
            rdruidMastery.leveljs.destroy(requestcache.db);

            setTimeout(function() {
                window.location.reload();
            }, 300);
        }
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerInputCtrl', function($scope, $state, settingsService) {
        $scope.continue = function() {
            if (!$scope.state.apikey) {
                alert('Need an API key to continue');
                return;
            }

            $scope.wclapi().getClasses().then(function() {
                settingsService.apikey = $scope.state.apikey;

                settingsService.$store()
                    .then(function() {
                        $state.go('app.mastery-analyzer.choose-report');
                    }).catch(function(e) {
                    alert(e);
                });
            }, function(e) {
                alert("API key doesn't seem to work: " + e);
            })
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
                            fight.actors = null;
                            if (typeof report.fightsWithResults[fight.id] !== "undefined") {
                                fight.actors = report.fightsWithResults[fight.id].actors;
                                return true;
                            }

                            return false;
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
            return $scope.chooseReport(report);
        };

        $scope.chooseReport = function(report) {
            return $state.go('app.mastery-analyzer.choose-fight', {
                reportID: report.id
            });
        };

        $scope.deleteReport = function(report) {
            $scope.reports = settingsService.reports = settingsService.reports.filter(function(_report) {
                return report.id !== _report.id;
            });

            return settingsService.$store();
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
    .controller('MasteryAnalyzerChooseCharacterCtrl', function($scope, $stateParams, $state, $timeout, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        $scope.loading = true;
        $scope.friendlies = null;

        $scope.wclapi().getFriendlies($scope.state.reportID).then(
            function(friendlies) {
                $timeout(function() {
                    $scope.friendlies = friendlies.filter(function(friendly) {
                        return friendly.type === "Druid" && friendly.fights.map(function(fight) {
                            return fight.id;
                        }).indexOf($scope.state.fightID) !== -1;
                    });
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

        $scope.progress = 0;

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
                        $scope.state.actorName = friendlies.filter(function(friendly) {
                            return friendly.id === $scope.state.actorID;
                        })[0].name;
                    })
                    .then(function() {
                        // get all events
                        return wclapi.getEvents($scope.state.reportID, $scope.state.actorID, fight.start_time, fight.end_time)
                            .progress(function(progress) {
                                $timeout(function() {
                                    $scope.progress++;
                                });
                            })
                            .then(function(events) {
                                $scope.state.events = events;

                                $state.go('app.mastery-analyzer.parse-fight', {
                                    reportID: $scope.state.reportID,
                                    fightID: fight.id,
                                    actorID: $scope.state.actorID
                            });
                        });
                    });
            })
            .fail(function(e) {
                alert("" + e);
            });
    });


angular.module('rdruid-mastery')
    .controller('MasteryAnalyzerParseFightCtrl', function($scope, $state, $q, $timeout, $stateParams, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        $scope.loading = true;
        $scope.parsing = false;

        $scope.continueInputFriendlies = function() {
            $scope.state.ignoreFriendlies[$scope.reportFightActorID()] = [];
            Object.keys($scope.state.ignoreFriendliesRaw).forEach(function(friendlyId) {
                if ($scope.state.ignoreFriendliesRaw[friendlyId]) {
                    $scope.state.ignoreFriendlies[$scope.reportFightActorID()].push(friendlyId);
                }
            });

            if (settingsService.ignoreFriendlies instanceof Array) {
                settingsService.ignoreFriendlies = {};
            }
            settingsService.ignoreFriendlies[$scope.reportFightActorID()] = $scope.state.ignoreFriendlies[$scope.reportFightActorID()];

            return settingsService.$store().then(function() {
                return $scope.parse();
            });
        };

        $scope.parse = function() {
            $scope.state.parser = new rdruidMastery.Parser($scope.state.fight, $scope.state.actorID, $scope.state.friendlies, $scope.state.events, $scope.state.ignoreFriendlies[$scope.reportFightActorID()] || []);

            $timeout(function() {
                $scope.loading = false;
                $scope.parsing = true;

                try {
                    $scope.state.parser.parse();
                } catch (e) {
                    alert(e);
                    throw e;
                }

                $q.when()
                    .then(function() {
                        if ($scope.STORE_RESULTS) {
                            settingsService.reports.forEach(function(report) {
                                if (report.id === $scope.state.reportID) {
                                    if (typeof report.fightsWithResults[$scope.state.fightID] === "undefined") {
                                        report.fightsWithResults[$scope.state.fightID] = {
                                            name: $scope.state.fight.name,
                                            id: $scope.state.fight.id,
                                            actors: []
                                        };
                                    }

                                    if (report.fightsWithResults[$scope.state.fightID].actors.map(function(actor) { return actor.id; }).indexOf($scope.state.actorID) === -1) {
                                        report.fightsWithResults[$scope.state.fightID].actors.push({
                                            id: $scope.state.actorID,
                                            name: $scope.state.actorName
                                        });
                                    }
                                }
                            });

                            settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightActorID()] = $scope.state.parser.result();

                            return settingsService.$store();
                        }
                    })
                    .then(function() {
                        $state.go('app.mastery-analyzer.result', {
                            reportID: $scope.state.reportID,
                            fightID: $scope.state.fightID,
                            actorID: $scope.state.actorID
                        });
                    });
            });
        };

        if ($scope.state.fight.boss === 1854) {
            $scope.inputFriendlies = true;
            $scope.state.ignoreFriendlies[$scope.reportFightActorID()] = settingsService.ignoreFriendlies[$scope.reportFightActorID()] || [];
            $scope.state.ignoreFriendliesRaw = {};
            $scope.state.ignoreFriendlies[$scope.reportFightActorID()].forEach(function(friendlyID) {
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
    .controller('MasteryAnalyzerResultCtrl', function($scope, $rootScope, $state, $timeout, $stateParams, settingsService) {
        if (!$scope.checkState($stateParams)) {
            return;
        }

        if (typeof settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightActorID()] !== "undefined") {
            $scope.result = settingsService.results[$scope.RESULTS_VERSION][$scope.reportFightActorID()];
        } else {
            $scope.result = $scope.state.parser.result();
        }

        if ($scope.result.talents.GERM && !$rootScope.germWarned) {
            $rootScope.germWarned = true;
            alert("CAUTION: The Germination talent currently messes up PotA, tearstone and 4pc calculations!");
        }
    });
