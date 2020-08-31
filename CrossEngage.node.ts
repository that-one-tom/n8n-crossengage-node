import { IExecuteFunctions } from 'n8n-core';
import {
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class CrossEngage implements INodeType {
	description: INodeTypeDescription = {
		credentials:  [{
			name: 'crossEngage',
			required: true,
		}],
		displayName: 'CrossEngage Statistics',
		name: 'crossEngage',
		group: ['transform'],
		version: 1,
		description: 'Fetch statistics for your campaigns and messages from CrossEngage',
		defaults: {
			name: 'CrossEngage',
			color: '#041041',
		},
		icon: 'file:ce.png',
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Fetch Statistics For',
				name: 'entity',
				type: 'options',
				options: [
					{
						name: 'Campaigns',
						value: 'campaign'
					}, {
						name: 'Messages',
						value: 'message'
					}
				],
				default: 'campaign',
				description: 'The entity to fetch statistics for'
			}, {
				displayName: 'Start Date',
				name: 'start_date',
				type: 'string',
				default: '2020-07-23',
				placeholder: 'YYYY-MM-DD',
				description: 'The start date for the statistics',
			}, {
				displayName: 'End Date',
				name: 'end_date',
				type: 'string',
				default: '2020-08-05',
				placeholder: 'YYYY-MM-DD',
				description: 'End date for the statistics',
			}
		]
	};


	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const credentials = this.getCredentials('crossEngage');
		let xng_user = credentials.xng_user;
		let xng_pass  = credentials.xng_pass;
		let xng_company_id: number;
		let xng_token: string;
		let xng_refresh_token: string;
		let start_date = this.getNodeParameter('start_date', 0, '') as string + 'T00:00:00.000Z';
		let end_date = this.getNodeParameter('end_date', 0, '') as string+ 'T23:59:59.999Z';
		let statistic_entity = this.getNodeParameter('entity', 0, '') as string;

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
					searchTerm : ''
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
			if (statistic_entity == 'message') {
				const campaign_details = await this.helpers.request({
					method: 'GET',
					url: 'https://ui-api.crossengage.io/ui/campaigns/' + campaign['id'].toString() + '/full',
					headers: {
						'Company-Id': xng_company_id,
						'Authorization': 'Bearer ' + xng_token
					},
					json: true
				});
				const channel_configs = campaign_details.channelConfigs;
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
						'Campaign Labels': campaign['labels'].map((l: { name: string; }) => l.name).join(', '),
						'Message ID': message['id'],
						'Message Name': message['label'],
						'Message Channel': message['channelType'],
						'Message Provider': message['subChannelType'],
						'Mail Subject': ''
					};
					if (message.hasOwnProperty('mailOptions') && message['mailOptions'] != null) {
						message_item['json']['Mail Subject'] = message['mailOptions'].hasOwnProperty('subject') && message['mailOptions']['subject'] != null ? message['mailOptions']['subject'] : '';
						// Potentially other mailOptions too?
					} else if (message.hasOwnProperty('channelOptions') && message['channelOptions'] != null) {
						message_item['json']['Mail Subject'] = message['channelOptions'].hasOwnProperty('subject') && message['channelOptions']['subject'] != null ? message['channelOptions']['subject'] : '';
					}
					let message_stats = message_stats_response.overall.find(m => m.id == message['id'].toString());
					metric_definitions.forEach(metric => {
						if (message_stats.values.hasOwnProperty(metric.id.toString())) {
							message_item['json'][metric.name] = isNaN(message_stats.values[metric.id.toString()]) ? null : message_stats.values[metric.id.toString()];
						}						
					});
					results.push(message_item);
				});
			} else {
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
					'Campaign Labels': campaign['labels'].map((l: { name: string; }) => l.name).join(', ')
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
	}
}
