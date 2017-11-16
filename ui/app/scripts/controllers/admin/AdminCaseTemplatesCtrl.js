(function() {
    'use strict';

    angular.module('theHiveControllers').controller('AdminCaseTemplatesCtrl',
        function($scope, $uibModal, CaseTemplateSrv, NotificationSrv, UtilsSrv, ListSrv, MetricsCacheSrv, CustomFieldsCacheSrv, UserSrv, UserInfoSrv, ModalUtilsSrv, templates) {
            var self = this;

            self.templates = templates;
            self.task = '';
            self.tags = [];
            self.metrics = [];
            self.fields = [];
            self.templateCustomFields = [];
            self.templateIndex = -1;
            self.getUserInfo = UserInfoSrv;

            /**
             * Convert the template custom fields definition to a list of ordered field names
             * to be used for drag&drop sorting feature
             */
            var getTemplateCustomFields = function(customFields) {
                var result = [];

                result = _.pluck(_.sortBy(_.map(customFields, function(definition, name){
                    return {
                        name: name,
                        order: definition.order
                    }
                }), function(item){
                    return item.order;
                }), 'name');

                return result;
            }

            self.sortableOptions = {
                handle: '.drag-handle',
                stop: function(/*e, ui*/) {
                    self.reorderTasks();
                },
                axis: 'y'
            };

            self.sortableFields = {
                handle: '.drag-handle',
                axis: 'y'
            };

            self.keys = function(obj) {
                if(!obj) {
                    return [];
                }
                return _.keys(obj);
            };

            self.loadCache = function() {
                MetricsCacheSrv.all().then(function(metrics){
                    self.metrics = metrics;
                });

                CustomFieldsCacheSrv.all().then(function(fields){
                    self.fields = fields;
                });
            };
            self.loadCache();

            self.getList = function(id) {
                CaseTemplateSrv.list().then(function(templates) {
                    self.templates = templates;

                    if(templates.length === 0) {
                        self.templateIndex = 0;
                        self.newTemplate();
                    } else if(id){
                        self.loadTemplateById(id);
                    } else {
                        self.loadTemplateById(templates[0].id, 0);
                    }
                });
            };

            self.loadTemplate = function(template, index) {
                if(!template) {
                    return;
                }

                self.template = _.omit(template,
                    '_type',
                    'createdAt',
                    'updatedAt',
                    'createdBy',
                    'updatedBy');
                self.tags = UtilsSrv.objectify(self.template.tags, 'text');
                self.templateCustomFields = getTemplateCustomFields(template.customFields);

                self.templateIndex = index || _.indexOf(self.templates, _.findWhere(self.templates, {id: template.id}));
            }

            self.loadTemplate(self.templates[0]);

            self.loadTemplateById = function(id) {
                CaseTemplateSrv.get(id)
                    .then(function(template) {
                        self.loadTemplate(template);
                    });
            };

            self.newTemplate = function() {
                self.template = {
                    name: '',
                    titlePrefix: '',
                    severity: 2,
                    tlp: 2,
                    tags: [],
                    tasks: [],
                    metrics: {},
                    customFields: {},
                    description: ''
                };
                self.tags = [];
                self.templateIndex = -1;
                self.templateCustomFields = [];
            };

            self.reorderTasks = function() {
                _.each(self.template.tasks, function(task, index) {
                    task.order = index;
                });
            };

            self.removeTask = function(task) {
                self.template.tasks = _.without(self.template.tasks, task);
                self.reorderTasks();
            };

            self.addTask = function() {
                var order = self.template.tasks ? self.template.tasks.length : 0;

                self.openTaskDialog({order: order}, 'Add');
            };

            self.editTask = function(task) {
                self.openTaskDialog(task, 'Update');
            };

            self.openTaskDialog = function(task, action) {
                var modal = $uibModal.open({
                    scope: $scope,
                    templateUrl: 'views/partials/admin/case-templates.task.html',
                    controller: 'AdminCaseTemplateTasksCtrl',
                    size: 'lg',
                    resolve: {
                        action: function() {
                            return action;
                        },
                        task: function() {
                            return _.extend({}, task);
                        },
                        users: function() {
                            return UserSrv.list({status: 'Ok'});
                        }
                    }
                });

                modal.result.then(function(data) {
                    debugger;
                    if(action === 'Add') {
                        if(self.template.tasks) {
                            self.template.tasks.push(data);
                        } else {
                            self.template.tasks = [data];
                        }
                    } else {
                        self.template.tasks[data.order] = data;
                    }
                });
            };

            self.addMetric = function(metric) {
                self.template.metrics = self.template.metrics || {};
                self.template.metrics[metric.name] = null;
            };

            self.removeMetric = function(metricName) {
                delete self.template.metrics[metricName];
            };

            self.addCustomField = function(field) {
                if(self.templateCustomFields.indexOf(field.reference) === -1) {
                    self.templateCustomFields.push(field.reference);
                } else {
                    NotificationSrv.log('The custom field [' + field.name + '] has already been added to the template', 'warning');
                }
            };

            self.removeCustomField = function(fieldName) {
                self.templateCustomFields = _.without(self.templateCustomFields, fieldName);
            };

            self.deleteTemplate = function() {
                ModalUtilsSrv.confirm('Remove case template', 'Are you sure you want to delete this case template?', {
                    okText: 'Yes, remove it',
                    flavor: 'danger'
                }).then(function() {
                    return CaseTemplateSrv.delete(self.template.id);
                }).then(function() {
                    self.getList();

                    $scope.$emit('templates:refresh');
                });
            };

            self.saveTemplate = function() {
                // Set tags
                self.template.tags = _.pluck(self.tags, 'text');

                // Set custom fields
                self.template.customFields = {};
                _.each(self.templateCustomFields, function(value, index) {
                    var fieldDef = self.fields[value];

                    self.template.customFields[value] = {};
                    self.template.customFields[value][fieldDef.type] = null;
                    self.template.customFields[value].order = index + 1;
                });

                if (_.isEmpty(self.template.id)) {
                    self.createTemplate(self.template);
                } else {
                    self.updateTemplate(self.template);
                }
            };

            self.createTemplate = function(template) {
                return CaseTemplateSrv.create(template)
                    .then(function(response) {
                        debugger;
                        self.getList(response.data.id);

                        $scope.$emit('templates:refresh');

                        NotificationSrv.log('The template [' + template.name + '] has been successfully created', 'success');
                    }, function(response) {
                        NotificationSrv.error('TemplateCtrl', response.data, response.status);
                    });
            };

            self.updateTemplate = function(template) {
                return CaseTemplateSrv.update(template.id, _.omit(template, ['id', 'user', '_type']))
                    .then(function(response) {
                        self.getList(template.id);

                        $scope.$emit('templates:refresh');

                        NotificationSrv.log('The template [' + template.name + '] has been successfully updated', 'success');
                    }, function(response) {
                        NotificationSrv.error('TemplateCtrl', response.data, response.status);
                    });
            };

            self.exportTemplate = function() {
                var fileName = 'Case-Template__' + self.template.name.replace(/\s/gi, '_') + '.json';

                // Create a blob of the data
                var fileToSave = new Blob([angular.toJson(_.omit(self.template, 'id'))], {
                    type: 'application/json',
                    name: fileName
                });

                // Save the file
                saveAs(fileToSave, fileName);
            }

            self.importTemplate = function() {
                var modalInstance = $uibModal.open({
                    animation: true,
                    templateUrl: 'views/partials/admin/case-template/import.html',
                    controller: 'AdminCaseTemplateImportCtrl',
                    controllerAs: 'vm',
                    size: 'lg'
                });

                modalInstance.result.then(function(template) {
                    return self.createTemplate(template);
                })
                .then(function(response) {
                    self.getList(response.data.id);

                    NotificationSrv.log('The template has been successfully imported', 'success');
                })
                .catch(function(err) {
                    if (err && err.status) {
                        NotificationSrv.error('TemplateCtrl', err.data, err.status);
                    }
                });
            }

        })
        .controller('AdminCaseTemplateTasksCtrl', function($scope, $uibModalInstance, action, task, users) {
            $scope.task = task || {};
            $scope.action = action;
            $scope.users = users;

            $scope.cancel = function() {
                $uibModalInstance.dismiss();
            };

            $scope.addTask = function() {
                $uibModalInstance.close(task);
            };
        })
        .controller('AdminCaseTemplateImportCtrl', function($scope, $uibModalInstance) {
            var self = this;
            this.formData = {
                fileContent: {}
            };

            $scope.$watch('vm.formData.attachment', function(file) {
                if(!file) {
                    self.formData.fileContent = {};
                    return;
                }
                var aReader = new FileReader();
                aReader.readAsText(self.formData.attachment, 'UTF-8');
                aReader.onload = function (evt) {
                    $scope.$apply(function() {
                        self.formData.fileContent = JSON.parse(aReader.result);
                    });
                }
                aReader.onerror = function (evt) {
                    $scope.$apply(function() {
                        self.formData.fileContent = {};
                    });
                }
            });

            this.ok = function () {
                var template = _.pick(this.formData.fileContent, 'name', 'title', 'description', 'tlp', 'severity', 'tags', 'status', 'titlePrefix', 'tasks', 'metrics', 'customFields');
                $uibModalInstance.close(template);
            };

            this.cancel = function () {
                $uibModalInstance.dismiss('cancel');
            };
        });

})();
