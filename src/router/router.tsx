import React, { useContext, useEffect } from 'react';
import LogInContext from '../context/LoginContext';
import Login from '../screens/Login';
import AppStack from './AppStack';

export const Router: React.FC = () => {
  const { firebase, isLoggedIn, setIsLoggedIn } = useContext(LogInContext);

  useEffect(() => {
    firebase.getCurrentUser().then(response => {
      if (response) setIsLoggedIn(true);
    });
  }, []);

  return isLoggedIn ? <AppStack /> : <Login />;
};
