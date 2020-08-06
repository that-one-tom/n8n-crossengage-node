import {
	ICredentialType,
	NodePropertyTypes,
} from 'n8n-workflow';


export class CrossEngage implements ICredentialType {
	name = 'crossEngage';
	displayName = 'CrossEngage';
	properties = [
		{
			displayName: 'UI Login',
			name: 'xng_user',
			type: 'string' as NodePropertyTypes,
			default: '',
		}, {
			displayName: 'UI Password',
			name: 'xng_pass',
			type: 'string' as NodePropertyTypes,
			default: ''
		}, {
			displayName: 'API Key',
			name: 'xng_token',
			type: 'string' as NodePropertyTypes,
			default: '',
		},
	];
}
