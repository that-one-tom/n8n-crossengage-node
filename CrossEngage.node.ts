import {
	IExecuteFunctions
} from 'n8n-core';
import {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class CrossEngage implements INodeType {
	description: INodeTypeDescription = {
		credentials: [{
			name: 'crossEngage',
			required: true,
		}],
		displayName: 'CrossEngage',
		name: 'crossEngage',
		group: ['transform'],
		version: 1,
		description: 'Fetch segment details or statistics for your campaigns and messages from CrossEngage',
		defaults: {
			name: 'CrossEngage',
			color: '#041041',
		},
		icon: 'file:ce.png',
		inputs: ['main'],
		outputs: ['main'],
		properties: [{
			displayName: 'Fetch',
			name: 'entity',
			type: 'options',
			options: [{
				name: 'Campaign Statistics',
				value: 'campaign'
			}, {
				name: 'Message Statistics',
				value: 'message'
			}, {
				name: 'A/B Variation Statistics',
				value: 'variation'
			}, {
				name: 'Segment Details',
				value: 'segmentDetails'
			}],
			default: 'campaign',
			description: 'The entity to fetch'
		}, {
			displayName: 'Start Date',
			name: 'start_date',
			type: 'string',
			default: '2020-07-23',
			placeholder: 'YYYY-MM-DD',
			description: 'The start date for the statistics',
			displayOptions: {
				show: {
					entity: ['campaign', 'message', 'variation']
				}
			}
		}, {
			displayName: 'End Date',
			name: 'end_date',
			type: 'string',
			default: '2020-08-05',
			placeholder: 'YYYY-MM-DD',
			description: 'End date for the statistics',
			displayOptions: {
				show: {
					entity: ['campaign', 'message', 'variation']
				}
			}
		}, {
			displayName: 'Segment ID Key',
			name: 'segment_id_property',
			type: 'string',
			default: 'Campaign Segment ID',
			placeholder: 'Campaign Segment ID',
			description: 'Property in which the segment ID is provided',
			displayOptions: {
				show: {
					entity: ['segmentDetails']
				}
			}
		}]
	};


	async execute(this: IExecuteFunctions): Promise < INodeExecutionData[][] > {
		const credentials = this.getCredentials('crossEngage');
		let xng_user = credentials.xng_user;
		let xng_pass = credentials.xng_pass;
		let xng_company_id: number;
		let xng_token: string;
		let xng_refresh_token: string;
		let start_date = this.getNodeParameter('start_date', 0, '') as string + 'T00:00:00.000Z';
		let end_date = this.getNodeParameter('end_date', 0, '') as string + 'T23:59:59.999Z';
		let fetch_entity = this.getNodeParameter('entity', 0, '') as string;
		let segment_id_property = this.getNodeParameter('segment_id_property', 0, '') as string;

		const xng_company_id_response = await this.helpers.request({
			method: 'POST',
			url: 'https://ui-api.crossengage.io/ui/managers/companies',
			body: {
				email: xng_user
			},
			json: true
		});
		xng_company_id = xng_company_id_response[0];

		const logins_response = await this.helpers.request({
			method: 'POST',
			url: 'https://ui-api.crossengage.io/ui/managers/login',
			headers: {
				'company-id': xng_company_id
			},
			body: {
				email: xng_user,
				password: xng_pass
			},
			json: true
		});
		xng_token = logins_response.token;
		xng_refresh_token = logins_response.refreshToken;


		if (['message', 'variation', 'campaign'].includes(fetch_entity)) {
			const campaigns_response = await this.helpers.request({
				method: 'POST',
				url: 'https://ui-api.crossengage.io/ui/campaigns/list',
				headers: {
					'Company-Id': xng_company_id,
					'Authorization': 'Bearer ' + xng_token,
					'X-XNG-ApiVersion': 2,
					'Content-Type': 'application/json'
				},
				qs: {
					offset: '0',
					limit: '10000',
					startDate: start_date,
					endDate: end_date
				},
				body: {
					filter: [],
					search: {
						searchType: 'name',
						searchTerm: ''
					}
				},
				json: true
			});

			const metric_definitions = await this.helpers.request({
				method: 'GET',
				url: 'https://ui-api.crossengage.io/ui/stats/metrics',
				headers: {
					'Company-Id': xng_company_id,
					'Authorization': 'Bearer ' + xng_token
				},
				json: true
			});

			let results = [];

			for (let i = 0; i < campaigns_response.list.length; i++) {
				let campaign = campaigns_response.list[i];

				if (fetch_entity == 'message') {

					const campaign_details = await this.helpers.request({
						method: 'GET',
						url: 'https://ui-api.crossengage.io/ui/campaigns/' + campaign['id'].toString() + '/full',
						headers: {
							'Company-Id': xng_company_id,
							'Authorization': 'Bearer ' + xng_token
						},
						json: true
					});
					const channel_configs = (campaign_details.channelConfigs || campaign_details.messages);
					const message_stats_response = await this.helpers.request({
						method: 'GET',
						url: 'https://ui-api.crossengage.io/ui/campaign/' + campaign['id'].toString() + '/stats',
						headers: {
							'Company-Id': xng_company_id,
							'Authorization': 'Bearer ' + xng_token,
							'X-XNG-ApiVersion': 2
						},
						qs: {
							interval: 'DAY',
							groupBy: 'MESSAGE',
							startDate: start_date,
							endDate: end_date
						},
						json: true
					});
					channel_configs.forEach(message => {
						let message_item = {};
						message_item['json'] = {
							'Company ID': xng_company_id,
							'Start Date': start_date,
							'End Date': end_date,
							'Campaign ID': campaign['id'],
							'Campaign Name': campaign['campaignName'],
							'Campaign Mode': campaign['campaignMode'],
							'Campaign Class': campaign['campaignClass'],
							'Campaign Status': campaign['status'],
							'Campaign Created': campaign['created'],
							'Campaign Modified': campaign['modified'],
							'Campaign Start Date': campaign_details['classOptions'] && campaign_details['classOptions']['startDate'] ? campaign_details['classOptions']['startDate'] : '',
							'Next Campaign Dispatch': campaign['nextDispatch'],
							'Campaign Group': campaign['groupName'],
							'Campaign Labels': campaign['labels'].map((l: {
								name: string;
							}) => l.name).join(', '),
							'Campaign Segment ID': campaign_details['filterId'],
							'Message ID': message['id'],
							'Message Name': message['label'],
							'Message Channel': message['channelType'],
							'Message Provider': message['subChannelType'],
							'Mail Subject': '',
							'Message Segment ID': message['filterId']
						};
						if (message.hasOwnProperty('mailOptions') && message['mailOptions'] != null) {
							if (message['mailOptions'].hasOwnProperty('subject') && message['mailOptions']['subject'] != null) {
								message_item['json']['Mail Subject'] = message['mailOptions']['subject'];
								// Potentially other mailOptions too?
							}
						} else if (message.hasOwnProperty('channelOptions') && message['channelOptions'] != null) {
							if (message['channelOptions'].hasOwnProperty('subject') && message['channelOptions']['subject'] != null) {
								message_item['json']['Mail Subject'] = message['channelOptions']['subject'];
								// Potentially other mailOptions too?
							}
						}
						let message_stats = message_stats_response.overall.find(m => m.id == message['id'].toString());
						metric_definitions.forEach(metric => {
							if (message_stats.values.hasOwnProperty(metric.id.toString())) {
								message_item['json'][metric.name] = isNaN(message_stats.values[metric.id.toString()]) ? null : message_stats.values[metric.id.toString()];
							}
						});
						results.push(message_item);
					});
				} else if (fetch_entity == 'variation') {
					const campaign_details = await this.helpers.request({
						method: 'GET',
						url: 'https://ui-api.crossengage.io/ui/campaigns/' + campaign['id'].toString() + '/full',
						headers: {
							'Company-Id': xng_company_id,
							'Authorization': 'Bearer ' + xng_token
						},
						json: true
					});
					const channel_configs = (campaign_details.channelConfigs || campaign_details.messages);
					const variation_stats_response = await this.helpers.request({
						method: 'GET',
						url: 'https://ui-api.crossengage.io/ui/campaign/' + campaign['id'].toString() + '/stats',
						headers: {
							'Company-Id': xng_company_id,
							'Authorization': 'Bearer ' + xng_token,
							'X-XNG-ApiVersion': 2
						},
						qs: {
							interval: 'DAY',
							groupBy: 'VARIATION',
							startDate: start_date,
							endDate: end_date
						},
						json: true
					});
					channel_configs.forEach(message => {
						let variation_data = [];
						if (message.hasOwnProperty('experiment') && message['experiment'] && message['experiment'].hasOwnProperty('variations') && message['experiment']['variations'] && message['experiment']['variations'].length > 0) {
							variation_data = message['experiment']['variations'];
							variation_data.forEach(variation => {
								let message_item = {};
								message_item['json'] = {
									'Company ID': xng_company_id,
									'Start Date': start_date,
									'End Date': end_date,
									'Campaign ID': campaign['id'],
									'Campaign Name': campaign['campaignName'],
									'Campaign Mode': campaign['campaignMode'],
									'Campaign Class': campaign['campaignClass'],
									'Campaign Status': campaign['status'],
									'Campaign Created': campaign['created'],
									'Campaign Modified': campaign['modified'],
									'Campaign Start Date': campaign_details['classOptions'] && campaign_details['classOptions']['startDate'] ? campaign_details['classOptions']['startDate'] : '',
									'Next Campaign Dispatch': campaign['nextDispatch'],
									'Campaign Group': campaign['groupName'],
									'Campaign Labels': campaign['labels'].map((l: {
										name: string;
									}) => l.name).join(', '),
									'Message ID': message['id'],
									'Message Name': message['label'],
									'Message Channel': message['channelType'],
									'Message Provider': message['subChannelType'],
									'Variation ID': '',
									'Variation Name': '',
									'Mail Subject': '',
								};
								message_item['json']['Variation ID'] = variation['id'];
								if (variation.hasOwnProperty('content') && variation['content']) {
									if (variation['content'].hasOwnProperty('label') && variation['content']['label']) {
										message_item['json']['Variation Name'] = variation['content']['label'];
									}
									if (variation['content'].hasOwnProperty('mailOptions') && variation['content']['mailOptions'] != null) {
										message_item['json']['Mail Subject'] = variation['content']['mailOptions'].hasOwnProperty('subject') && variation['content']['mailOptions']['subject'] != null ? variation['content']['mailOptions']['subject'] : '';
									} else if (variation['content'].hasOwnProperty('channelOptions') && variation['content']['channelOptions'] != null) {
										message_item['json']['Mail Subject'] = variation['content']['channelOptions'].hasOwnProperty('subject') && variation['content']['channelOptions']['subject'] != null ? variation['content']['channelOptions']['subject'] : '';
									}
								}
								let variation_stats = variation_stats_response.overall.find(v => v.id == variation['id'].toString());
								metric_definitions.forEach(metric => {
									if (variation_stats.values.hasOwnProperty(metric.id.toString())) {
										message_item['json'][metric.name] = isNaN(variation_stats.values[metric.id.toString()]) ? null : variation_stats.values[metric.id.toString()];
									}
								});
								results.push(message_item);
							});
						}
					});
				} else if (fetch_entity == 'campaign') {
					let campaign_item = {};
					campaign_item['json'] = {
						'Company ID': xng_company_id,
						'Start Date': start_date,
						'End Date': end_date,
						'Campaign ID': campaign['id'],
						'Campaign Name': campaign['campaignName'],
						'Campaign Mode': campaign['campaignMode'],
						'Campaign Class': campaign['campaignClass'],
						'Campaign Status': campaign['status'],
						'Campaign Created': campaign['created'],
						'Campaign Modified': campaign['modified'],
						'Next Campaign Dispatch': campaign['nextDispatch'],
						'Campaign Group': campaign['groupName'],
						'Campaign Labels': campaign['labels'].map((l: {
							name: string;
						}) => l.name).join(', ')
					};
					metric_definitions.forEach(metric => {
						if (campaign.statistics.hasOwnProperty(metric.id.toString())) {
							campaign_item['json'][metric.name] = isNaN(campaign.statistics[metric.id.toString()]) ? null : campaign.statistics[metric.id.toString()];
						}
					});
					results.push(campaign_item);
				}
			}

			return this.prepareOutputData(results);
		} else if (['segmentDetails'].includes(fetch_entity)) {
			const items = this.getInputData();
			let results = [];

			for (const element of items) {
				const segment_response = await this.helpers.request({
					method: 'GET',
					url: 'https://ui-api.crossengage.io/ui/filters/' + element.json[segment_id_property],
					headers: {
						'Company-Id': xng_company_id,
						'Authorization': 'Bearer ' + xng_token
					},
					json: true
				});
				let result = {
					json: {
						'Segment ID': segment_response['id'],
						'Segment Name': segment_response['label']
					}
				};
				results.push(result);
			}
			
			return this.prepareOutputData(results);
		}

	}
}