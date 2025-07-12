import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { amplifyConfig } from './amplify-config';
import Game from './Game';

// Initialize Amplify
Amplify.configure(amplifyConfig);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Game />);
