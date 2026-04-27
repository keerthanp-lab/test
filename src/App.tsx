import { StyleSheet, Text, useColorScheme, View } from 'react-native'
import React from 'react'
import { LogInContextProvider } from './context/LoginContext'
import { Router } from './router/router'
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native'
import 'react-native-gesture-handler'

const App = () => {
  const scheme = useColorScheme();
  return (
    <>
    <LogInContextProvider>
      <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>

      <Router/>
      </NavigationContainer>
    </LogInContextProvider>
    </>
  )
}

export default App

const styles = StyleSheet.create({})