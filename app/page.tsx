"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  LiveKitRoom,
  useVoiceAssistant,
  BarVisualizer,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  AgentState,
  DisconnectButton,
} from "@livekit/components-react";
import { useCallback, useEffect, useState, useRef } from "react";
import { MediaDeviceFailure } from "livekit-client";
import type { ConnectionDetails } from "@/app/api/connection-details/route";
import { NoAgentNotification } from "@/app/components/NoAgentNotification";
import { CloseIcon } from "@/app/components/CloseIcon";
import { useKrispNoiseFilter } from "@livekit/components-react/krisp";

// Create a shared audio context that can be used across components
const createSharedAudioContext = () => {
  if (typeof window !== 'undefined') {
    try {
      // Attempt to create a new AudioContext, falling back to webkitAudioContext if necessary
      return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch (e) {
      console.error('Failed to create AudioContext:', e);
      return null;
    }
  }
  return null;
};

export default function Home() {
  const [connectionDetails, updateConnectionDetails] = useState<
    ConnectionDetails | undefined
  >(undefined);
  const [agentState, setAgentState] = useState<AgentState>("disconnected");
  // Create a ref to hold our shared AudioContext
  const audioContextRef = useRef<AudioContext | null>(null);
  
  useEffect(() => {
    // Initialize the shared audio context on component mount
    if (!audioContextRef.current) {
      audioContextRef.current = createSharedAudioContext();
      console.log('Created shared AudioContext:', audioContextRef.current);
    }
    
    // Add a global error handler to catch audio-related errors
    const handleError = (event: ErrorEvent) => {
      if (event.error && event.error.message && event.error.message.includes('AudioNode')) {
        console.error('Audio-related error caught:', event.error);
        if (audioContextRef.current) {
          console.log('Current AudioContext state:', audioContextRef.current.state);
        }
      }
    };
    
    window.addEventListener('error', handleError);
    
    // Clean up the audio context on unmount
    return () => {
      window.removeEventListener('error', handleError);
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
          console.log('Closed shared AudioContext');
        } catch (e) {
          console.error('Error closing AudioContext:', e);
        }
      }
    };
  }, []);

  const onConnectButtonClicked = useCallback(async () => {
    // Generate room connection details, including:
    //   - A random Room name
    //   - A random Participant name
    //   - An Access Token to permit the participant to join the room
    //   - The URL of the LiveKit server to connect to
    //
    // In real-world application, you would likely allow the user to specify their
    // own participant name, and possibly to choose from existing rooms to join.

    const url = new URL(
      process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ??
        "/api/connection-details",
      window.location.origin
    );

    // Customize these values for your own application
    const userName = "Dr. John A. Zoidberg";
    const agentId = "agentId_1234567";
    const userId = "userId_123456789";

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        // Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userName, agentId, userId }),
    });
    const connectionDetailsData = await response.json();
    updateConnectionDetails(connectionDetailsData);
  }, []);

  return (
    <main
      data-lk-theme="default"
      className="h-screen grid content-center bg-[var(--lk-bg)]"
    >
      <LiveKitRoom
        token={connectionDetails?.participantToken}
        serverUrl={connectionDetails?.serverUrl}
        connect={connectionDetails !== undefined}
        audio={true}
        video={false}
        onMediaDeviceFailure={onDeviceFailure}
        onDisconnected={() => {
          updateConnectionDetails(undefined);
        }}
        className="grid grid-rows-[2fr_1fr] items-center"
      >
        <SimpleVoiceAssistant onStateChange={setAgentState} audioContext={audioContextRef.current} />
        <ControlBar
          onConnectButtonClicked={onConnectButtonClicked}
          agentState={agentState}
          audioContext={audioContextRef.current}
        />
        <RoomAudioRenderer />
        <NoAgentNotification state={agentState} />
      </LiveKitRoom>
    </main>
  );
}

function SimpleVoiceAssistant(props: {
  onStateChange: (state: AgentState) => void;
  audioContext: AudioContext | null;
}) {
  const { state, audioTrack } = useVoiceAssistant();
  useEffect(() => {
    props.onStateChange(state);
  }, [props, state]);
  return (
    <div className="h-[300px] max-w-[90vw] mx-auto">
      <BarVisualizer
        state={state}
        barCount={5}
        trackRef={audioTrack}
        className="agent-visualizer"
        options={{ 
          minHeight: 24, 
          // @ts-expect-error - audioContext is valid but not in type definition
          audioContext: props.audioContext 
        }}
      />
    </div>
  );
}

function ControlBar(props: {
  onConnectButtonClicked: () => void;
  agentState: AgentState;
  audioContext: AudioContext | null;
}) {
  /**
   * Use Krisp background noise reduction when available.
   * Note: This is only available on Scale plan, see {@link https://livekit.io/pricing | LiveKit Pricing} for more details.
   */
  const krisp = useKrispNoiseFilter();
  useEffect(() => {
    if (krisp) {
      krisp.setNoiseFilterEnabled(true);
      // If krisp has a method to set audio context, use it
      if (props.audioContext) {
        try {
          // @ts-expect-error - setAudioContext may exist in newer versions
          if (typeof krisp.setAudioContext === 'function') {
            // @ts-expect-error - setAudioContext may exist in newer versions
            krisp.setAudioContext(props.audioContext);
          }
        } catch (e) {
          console.error('Error setting audio context for noise filter:', e);
        }
      }
    }
  }, [krisp, props.audioContext]);

  return (
    <div className="relative h-[100px]">
      <AnimatePresence>
        {props.agentState === "disconnected" && (
          <motion.button
            initial={{ opacity: 0, top: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, top: "-10px" }}
            transition={{ duration: 1, ease: [0.09, 1.04, 0.245, 1.055] }}
            className="uppercase absolute left-1/2 -translate-x-1/2 px-4 py-2 bg-white text-black rounded-md"
            onClick={() => props.onConnectButtonClicked()}
          >
            Start a conversation
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {props.agentState !== "disconnected" &&
          props.agentState !== "connecting" && (
            <motion.div
              initial={{ opacity: 0, top: "10px" }}
              animate={{ opacity: 1, top: 0 }}
              exit={{ opacity: 0, top: "-10px" }}
              transition={{ duration: 0.4, ease: [0.09, 1.04, 0.245, 1.055] }}
              className="flex h-8 absolute left-1/2 -translate-x-1/2  justify-center"
            >
              <VoiceAssistantControlBar controls={{ leave: false }} />
              <DisconnectButton>
                <CloseIcon />
              </DisconnectButton>
            </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}

function onDeviceFailure(error?: MediaDeviceFailure) {
  console.error(error);
  alert(
    "Error acquiring camera or microphone permissions. Please make sure you grant the necessary permissions in your browser and reload the tab"
  );
}
