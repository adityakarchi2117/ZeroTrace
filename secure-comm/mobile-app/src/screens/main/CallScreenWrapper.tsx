/**
 * CallScreenWrapper
 * Navigation wrapper for the VideoCall/CallScreen component
 * Integrates with WebSocket manager for call signaling
 */

import React, { useCallback } from 'react';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';

import { CallScreen } from '../../components/VideoCall/CallScreen';
import { wsManager } from '../../services/websocket';

type CallRouteParams = {
    Call: {
        username: string;
        userId: number;
        callType: 'audio' | 'video';
        isIncoming: boolean;
        callId?: string;
    };
};

const CallScreenWrapper: React.FC = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<CallRouteParams, 'Call'>>();
    const { username, callType, isIncoming, callId } = route.params;

    const actualCallId = callId || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const handleEndCall = useCallback(() => {
        wsManager.sendCallEnd(username, actualCallId);
        navigation.goBack();
    }, [username, actualCallId, navigation]);

    const handleAnswer = useCallback(() => {
        wsManager.sendCallAnswer(username, { type: 'answer' }, actualCallId);
    }, [username, actualCallId]);

    const handleReject = useCallback(() => {
        wsManager.sendCallReject(username, actualCallId);
        navigation.goBack();
    }, [username, actualCallId, navigation]);

    const handleWsSend = useCallback(
        (data: any) => {
            if (data.type === 'ice_candidate') {
                wsManager.sendIceCandidate(username, data.candidate, actualCallId);
            } else if (data.type === 'call_offer') {
                wsManager.sendCallOffer(username, data.offer, callType, actualCallId);
            } else if (data.type === 'call_answer') {
                wsManager.sendCallAnswer(username, data.answer, actualCallId);
            } else if (data.type === 'call_end') {
                wsManager.sendCallEnd(username, actualCallId);
            }
        },
        [username, callType, actualCallId]
    );

    return (
        <CallScreen
            callId={actualCallId}
            remoteUsername={username}
            callType={callType}
            isIncoming={isIncoming}
            onEndCall={handleEndCall}
            onAnswer={handleAnswer}
            onReject={handleReject}
            wsSend={handleWsSend}
        />
    );
};

export default CallScreenWrapper;
