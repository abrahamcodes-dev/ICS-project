import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {GuestStackParams} from '../../navigation/GuestNavigator';
import AuthForm from './AuthForm';
export default function RegisterScreen({navigation}:NativeStackScreenProps<GuestStackParams,'Register'>){return <AuthForm mode="register" onAlternate={()=>navigation.navigate('Login')}/>;}
