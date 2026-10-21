import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {GuestStackParams} from '../../navigation/GuestNavigator';
import AuthForm from './AuthForm';
import {Action} from '../../ui/design';
export default function LoginScreen({navigation}:NativeStackScreenProps<GuestStackParams,'Login'>){return <AuthForm mode="login" onAlternate={()=>navigation.navigate('Register')} footer={<Action title="Health assistant (no sign-in needed)" secondary onPress={()=>navigation.navigate('Chatbot')}/>}/>;}
