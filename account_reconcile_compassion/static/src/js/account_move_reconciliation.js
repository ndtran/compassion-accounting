/* This is Javascript extension of module account
   in order to add custom reconcile buttons in the 
   Manual Reconcile view */
openerp.account_reconcile_compassion = function (instance) {
    var _t = instance.web._t,
        _lt = instance.web._lt;
    var QWeb = instance.web.qweb;
    

    // Extend the class written in module account (bank statement view)
    instance.web.account.bankStatementReconciliationLine.include({
        events: _.extend({
            // // TODO : this removes the ability to change partner of a line
            // //        but this functionality may not be necessary for us.
            "click .partner_name": "open_partner",
        }, instance.web.account.bankStatementReconciliationLine.prototype.events),
        
        open_partner : function() {
            this.do_action({
                views: [[false, 'form']],
                view_type: 'form',
                view_mode: 'form',
                res_model: 'res.partner',
                type: 'ir.actions.act_window',
                target: 'current',
                res_id: this.partner_id,
            });
        },
        
         // Capture when product is selected to put the corresponding account.
        formCreateInputChanged: function(elt, val) {
            var line_created_being_edited = this.get("line_created_being_edited");
            var self = this;

            if (elt === this.product_id_field) {
                var model_product = new instance.web.Model("product.product");
                var product = new $.Deferred();
                var product_id = elt.get("value");
                product = $.when(model_product.call("read", [product_id, ['property_account_income']])).then(function(data){
                    self.account_id_field.set_value(data.property_account_income[0]);
                });
            }
            
            this._super(elt, val);
        },
        
        // Set domain of sponsorship field
        initializeCreateForm: function() {
            var self = this;
            _.each(self.create_form, function(field) {
                if (field.name == 'sponsorship_id') {
                    field.field.domain = ['|', '|', ['partner_id', '=', self.partner_id], ['partner_id.parent_id', '=', self.partner_id], ['correspondant_id', '=', self.partner_id], ['state', '!=', 'draft']]
                }
            });
            this._super()
        },
        
        // Return values of new fields to python.
        prepareCreatedMoveLineForPersisting: function(line) {
            var dict = this._super(line);
            if (line.product_id) dict['product_id'] = line.product_id;
            if (line.sponsorship_id) dict['sponsorship_id'] = line.sponsorship_id;
            if (line.user_id) dict['user_id'] = line.user_id;
            return dict;
        },
    })
    
    instance.web.account.bankStatementReconciliation.include({
        events: _.extend({
            "click .button_do_all": "reconcileAll",
        }, instance.web.account.bankStatementReconciliation.prototype.events),
        
        // Add fields in reconcile view
        init: function(parent, context) {
            this._super(parent, context);
            this.create_form_fields["product_id"] = {
                id: "product_id",
                index: 5,
                corresponding_property: "product_id",
                label: _t("Product"),
                required: false,
                tabindex: 15,
                constructor: instance.web.form.FieldMany2One,
                field_properties: {
                    relation: "product.product",
                    string: _t("Product"),
                    type: "many2one",
                }
            };
            this.create_form_fields["sponsorship_id"] = {
                id: "sponsorship_id",
                index: 6,
                corresponding_property: "sponsorship_id",
                label: _t("Sponsorship"),
                required: false,
                tabindex: 16,
                constructor: instance.web.form.FieldMany2One,
                field_properties: {
                    relation: "recurring.contract",
                    string: _t("Sponsorship"),
                    type: "many2one",
                    options: {'field_color': 'state',
                              'colors': {'cancelled': 'gray', 'terminated': 'gray', 'mandate': 'red', 'waiting': 'green'}, 'create':false, 'create_edit':false},
                }
            };
            this.create_form_fields["user_id"] = {
                id: "user_id",
                index: 7,
                corresponding_property: "user_id",
                label: _t("Ambassador"),
                required: false,
                tabindex: 17,
                constructor: instance.web.form.FieldMany2One,
                field_properties: {
                    relation: "res.partner",
                    string: _t("Ambassador"),
                    type: "many2one",
                }
            };
        },
        
        // Add product_id to statement operations.
        start: function() {
            var self = this;
            return this._super().then(function() {
                new instance.web.Model("account.statement.operation.template")
                .query(['id','name','account_id','label','amount_type','amount','tax_id','analytic_account_id','product_id'])
                .all().then(function (data) {
                    _(data).each(function(preset){
                        self.presets[preset.id] = preset;
                    });
                })
            });
        },
        
        // Change behaviour when clicking on name of bank statement
        statementNameClickHandler: function() {
            this.do_action({
                views: [[false, 'form']],
                view_type: 'form',
                view_mode: 'form',
                res_model: 'account.bank.statement',
                type: 'ir.actions.act_window',
                target: 'current',
                res_id: this.statement_ids[0],
            });
        },

        reconcileAll: function() {
            this.reconcile_all = true;
            var reconciliations = _.filter(this.getChildren(), function(o) { return o.get("balance").toFixed(3) === "0.000"; })
            this.persistReconciliations(reconciliations);
        },

        displayReconciliations: function(number) {
            var self = this;
            return this._super(number).done(function() {
                var reconciliations = _.filter(self.getChildren(), function(o) { return o.get("balance").toFixed(3) === "0.000"; })
                if (self.reconcile_all && reconciliations.length > 0) {
                    self.persistReconciliations(reconciliations);
                } else {
                    self.reconcile_all = false;
                }
            });
        },
    })

    // Extend the class written in module account (manual reconcile)
    instance.web.account.ReconciliationListView.include({
        init: function() {
            this._super.apply(this, arguments);
            var self = this;
            // Enable or disable buttons based on number of lines selected
            this.on('record_selected', this, function() {
                if (self.get_selected_ids().length === 0) {
                    self.$(".oe_account_recon_reconcile").attr("disabled", "");
                } else {
                    self.$(".oe_account_recon_reconcile").removeAttr("disabled");
                }
                if (self.get_selected_ids().length < 2) {
                    self.$(".oe_account_recon_reconcile_fund").attr("disabled", "");
                    self.$(".oe_account_recon_reconcile_split").attr("disabled", "");
                } else {
                    self.$(".oe_account_recon_reconcile_fund").removeAttr("disabled");
                    self.$(".oe_account_recon_reconcile_split").removeAttr("disabled");
                }
            });
        },
        
        load_list: function() {
            var self = this;
            var tmp = this._super.apply(this, arguments);
            if (this.partners) {
                // Add the buttons of reconciliation
                this.$(".oe_account_recon_reconcile").after(QWeb.render("AccountReconciliationCompassion", {widget: this}));
                this.$(".oe_account_recon_next").after(QWeb.render("AccountReconciliationOpenPartner", {widget: this}));
                
                // Add listeners to button clicks and open the corresponding wizard
                this.$(".oe_account_recon_reconcile_fund").click(function() {
                    self.reconcile_fund();
                });
                this.$(".oe_account_recon_reconcile_split").click(function() {
                    self.reconcile_split();
                });
                this.$(".oe_account_recon_open_partner").click(function() {
                    self.open_partner();
                });
            }
            
            return tmp;
        },
        reconcile_fund: function() {
            this.reconcile_custom_wizard("action_reconcile_fund_wizard")
        },
        reconcile_split: function() {
            this.reconcile_custom_wizard("action_reconcile_split_payment_wizard")
        },
        reconcile_custom_wizard: function(action_wizard){
            var self = this;
            var ids = this.get_selected_ids();
            if (ids.length < 2) {
                instance.web.dialog($("<div />").text(_t("You must choose at least two records.")), {
                    title: _t("Warning"),
                    modal: true
                });
                return false;
            }

            new instance.web.Model("ir.model.data").call("get_object_reference", ["account_reconcile_compassion", action_wizard]).then(function(result) {
                var additional_context = _.extend({
                    active_id: ids[0],
                    active_ids: ids,
                    active_model: self.model
                });
                return self.rpc("/web/action/load", {
                    action_id: result[1],
                    context: additional_context
                }).done(function (result) {
                    result.context = instance.web.pyeval.eval('contexts', [result.context, additional_context]);
                    result.flags = result.flags || {};
                    result.flags.new_window = true;
                    return self.do_action(result, {
                        on_close: function () {
                            // Refresh the Manual Reconcile View after wizard is closed
                            self.do_search(self.last_domain, self.last_context, self.last_group_by);
                        }
                    });
                });
            });
        },
        
        open_partner : function() {
            this.do_action({
                views: [[false, 'form']],
                view_type: 'form',
                view_mode: 'form',
                res_model: 'res.partner',
                type: 'ir.actions.act_window',
                target: 'current',
                res_id: this.partners[this.current_partner][0],
            });
        }
        
    });
};
