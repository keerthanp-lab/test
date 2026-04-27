import React, { useContext, useColorScheme } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
} from '@react-navigation/drawer';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import Home from '../screens/Home';
import PersonalExpenses from '../screens/PersonalExpenses';
import GroceryList from '../screens/GroceryList';
import Analytics from '../screens/Analytics';
import LogInContext from '../context/LoginContext';

const Drawer = createDrawerNavigator();

function CustomDrawerContent(props: any) {
  const { firebase, setIsLoggedIn } = useContext(LogInContext);

  const handleLogout = () => {
    Alert.alert(
      'Logout Confirmation',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            firebase.logOut();
            setIsLoggedIn(false);
          },
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <DrawerContentScrollView {...props}>
      <DrawerItemList {...props} />
      <View style={{ margin: 20 }}>
        <TouchableOpacity
          style={{
            backgroundColor: 'red',
            paddingVertical: 10,
            paddingHorizontal: 15,
            borderRadius: 5,
          }}
          onPress={handleLogout}>
          <Text style={{ color: 'white', textAlign: 'center' }}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </DrawerContentScrollView>
  );
}

export default function AppStack() {
  const scheme = useColorScheme();

  return (
    <Drawer.Navigator
      initialRouteName="Home"
      drawerContent={props => <CustomDrawerContent {...props} />}
      screenOptions={{
        drawerStyle: {
          backgroundColor:
            scheme === 'dark'
              ? DarkTheme.colors.background
              : DefaultTheme.colors.background,
        },
        headerStyle: {
          backgroundColor:
            scheme === 'dark' ? DarkTheme.colors.card : DefaultTheme.colors.card,
        },
        headerTintColor:
          scheme === 'dark' ? DarkTheme.colors.text : DefaultTheme.colors.text,
      }}>
      <Drawer.Screen name="Home" component={Home} />
      <Drawer.Screen name="Personal Expenses" component={PersonalExpenses} />
      <Drawer.Screen name="Grocery List" component={GroceryList} />
      <Drawer.Screen name="Analytics" component={Analytics} />
    </Drawer.Navigator>
  );
}
