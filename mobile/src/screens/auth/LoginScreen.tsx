import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {GuestStackParams} from '../../navigation/GuestNavigator';
import AuthForm from './AuthForm';
export default function LoginScreen({navigation}:NativeStackScreenProps<GuestStackParams,'Login'>){return <AuthForm mode="login" onBack={()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('AccountAccess')} onAlternate={()=>navigation.navigate('RoleSelection')} onAssistant={()=>navigation.navigate('Chatbot')}/>;}
