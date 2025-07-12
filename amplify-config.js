// AWS Amplify configuration
import { Auth } from 'aws-amplify';

export const amplifyConfig = {
  Auth: {
    region: 'us-east-1', // Change to your preferred AWS region
    userPoolId: 'YOUR_USER_POOL_ID', // Replace with your Cognito User Pool ID
    userPoolWebClientId: 'YOUR_USER_POOL_CLIENT_ID', // Replace with your User Pool Client ID
    mandatorySignIn: false,
  },
  API: {
    graphql_endpoint: 'YOUR_APPSYNC_ENDPOINT', // Replace with your AppSync endpoint
    graphql_headers: async () => ({
      Authorization: (await Auth.currentSession()).getIdToken().getJwtToken(),
    }),
  },
};