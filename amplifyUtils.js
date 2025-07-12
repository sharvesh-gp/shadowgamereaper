import { API, graphqlOperation, Auth } from 'aws-amplify';

// GraphQL queries and mutations
const createLeaderboardEntryMutation = `
  mutation CreateLeaderboardEntry($input: CreateLeaderboardEntryInput!) {
    createLeaderboardEntry(input: $input) {
      id
      name
      score
      maxLevel
      accuracy
      date
    }
  }
`;

const listLeaderboardEntriesQuery = `
  query ListLeaderboardEntriesByScore($limit: Int) {
    listLeaderboardEntriesByScore(limit: $limit) {
      id
      name
      score
      maxLevel
      accuracy
      date
    }
  }
`;

// Save score to global leaderboard
export const saveScoreToCloud = async (playerName, score, maxLevel, accuracy) => {
  try {
    // Check if user is signed in
    let user;
    try {
      user = await Auth.currentAuthenticatedUser();
    } catch (e) {
      // If not signed in, sign in as guest
      user = await signInAsGuest(playerName);
    }
    
    const input = {
      name: playerName,
      score: score,
      maxLevel: maxLevel,
      accuracy: accuracy,
      date: new Date().toISOString(),
    };
    
    await API.graphql(graphqlOperation(createLeaderboardEntryMutation, { input }));
    return true;
  } catch (error) {
    console.error('Error saving score to cloud:', error);
    return false;
  }
};

// Get global leaderboard
export const fetchGlobalLeaderboard = async (limit = 50) => {
  try {
    const response = await API.graphql(graphqlOperation(listLeaderboardEntriesQuery, { limit }));
    return response.data.listLeaderboardEntriesByScore || [];
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    return [];
  }
};

// Sign in as guest using player name
export const signInAsGuest = async (username) => {
  try {
    // Generate a unique password based on username and timestamp
    const password = `Guest_${username}_${Date.now()}`;
    
    try {
      // Try to sign up the user first
      await Auth.signUp({
        username,
        password,
        attributes: {
          name: username,
        }
      });
      
      // Auto-confirm the user (in production, you'd use a Lambda trigger)
      // This is simplified for demo purposes
    } catch (signUpError) {
      // User might already exist, ignore this error
      console.log('User might already exist:', signUpError);
    }
    
    // Try to sign in
    return await Auth.signIn(username, password);
  } catch (error) {
    console.error('Error signing in as guest:', error);
    throw error;
  }
};