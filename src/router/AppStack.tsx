import React, { useContext, useColorScheme, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import Profile from '../screens/Profile';
import LogInContext from '../context/LoginContext';
import { Colors, FontSize, Spacing, BorderRadius } from '../constants/theme';

const Drawer = createDrawerNavigator();

function CustomDrawerContent(props: any) {
  const { firebase, setIsLoggedIn } = useContext(LogInContext);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    firebase.getCurrentUser().then((user: any) => {
      if (user) {
        setDisplayName(user.displayName ?? '');
        setEmail(user.email ?? '');
      }
    });
  }, []);

  const initials = (displayName || email)
    .split(/[@.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0].toUpperCase())
    .join('');

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: () => { firebase.logOut(); setIsLoggedIn(false); } },
      ],
    );
  };

  return (
    <DrawerContentScrollView {...props}>
      {/* User header */}
      <View style={ds.header}>
        <View style={ds.avatar}>
          <Text style={ds.avatarText}>{initials || '?'}</Text>
        </View>
        <Text style={ds.name} numberOfLines={1}>
          {displayName || 'My Account'}
        </Text>
        <Text style={ds.email} numberOfLines={1}>{email}</Text>
      </View>

      <View style={ds.divider} />

      <DrawerItemList {...props} />

      <View style={ds.footer}>
        <TouchableOpacity style={ds.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={ds.logoutText}>Log Out</Text>
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
            scheme === 'dark' ? DarkTheme.colors.background : DefaultTheme.colors.background,
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
      <Drawer.Screen name="Profile" component={Profile} />
    </Drawer.Navigator>
  );
}

const ds = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: Colors.white },
  name: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  email: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm, marginHorizontal: Spacing.lg },
  footer: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  logoutBtn: {
    backgroundColor: Colors.danger,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  logoutText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
});
