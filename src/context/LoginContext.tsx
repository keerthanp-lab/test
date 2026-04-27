import { FC, PropsWithChildren, createContext, useRef, useState } from 'react';
import FirebaseService from '../database/UserAccount';

type LoginContextType = {
  firebase: FirebaseService;
  isLoggedIn: boolean;
  setIsLoggedIn: (isLoggedIn: boolean) => void;
};

export const LogInContext = createContext<LoginContextType>({
  firebase: new FirebaseService(),
  isLoggedIn: false,
  setIsLoggedIn: () => {},
});

export const LogInContextProvider: FC<PropsWithChildren> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // useRef keeps a single FirebaseService instance for the lifetime of the provider
  const firebaseRef = useRef(new FirebaseService());

  const value: LoginContextType = {
    firebase: firebaseRef.current,
    isLoggedIn,
    setIsLoggedIn,
  };

  return <LogInContext.Provider value={value}>{children}</LogInContext.Provider>;
};

export default LogInContext;
