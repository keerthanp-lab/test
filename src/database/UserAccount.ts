import auth from '@react-native-firebase/auth';
import Snackbar from 'react-native-snackbar';
// import { getAuth, onAuthStateChanged } from "firebase/auth";

type CreateUserAccount = {
    email: string;
    password: string;
    name: string
}
type LoginUserAccount = {
    email: string;
    password: string;
}

class FirebaseSerive {

    account;
    constructor() {
        this.account = auth()
    }
    CreateAccount = async ({ email, password }: LoginUserAccount) => {
        try {
            // Call Firebase authentication function to create user
            const userAccount = await this.account.createUserWithEmailAndPassword(email, password);
            console.log('Success', 'User account created successfully!');
            if (userAccount) {
                return this.login({ email, password })
            }
            else {
                return userAccount
            }
        } catch (error) {
            console.log("Firebase Error ::Create account " + error)
            // Alert.alert('Error', error);
        }
    };

    login = async ({ email, password }: LoginUserAccount) => {
        try {

            const credits = await this.account.signInWithEmailAndPassword(email, password)

            return credits

        } catch (error) {
            Snackbar.show({
                text: "Wrong Credentials",
                duration: Snackbar.LENGTH_SHORT
            })
            console.log("Firebase Error ::Log in  account " + error)
        }
    }

    getCurrentUser = async () => {
        try {

            return await this.account.currentUser
        } catch (error) {
            console.log("Firebase Error ::Get Current user account " + error)
            return false
        }
    }

    logOut = async () => {
        try {
            await auth().signOut()
            return true

        } catch (error) {
            console.log("Firebase Error ::Sign out user account " + error)
            return false

        }

    }
    updateUser = async ({ displayName }: { displayName: string }) => {
        try {
            await this.account.currentUser.updateProfile({ displayName })
            return true
        } catch (error) {
            console.log("Firebase Error ::Update user account " + error)
            return false
        }
    }

}

export default FirebaseSerive



