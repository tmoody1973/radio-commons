import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

/** Amazon Polly's generative voice as a streaming MP3. Never a voice imitating Alexa. */
export function pollyStream(client: PollyClient, voiceId = "Ruth") {
  return async (text: string): Promise<ReadableStream<Uint8Array>> => {
    const response = await client.send(new SynthesizeSpeechCommand({ Engine: "generative", VoiceId: voiceId as never, OutputFormat: "mp3", Text: text }));
    if (!response.AudioStream) throw new Error("Polly returned no audio");
    return response.AudioStream.transformToWebStream() as ReadableStream<Uint8Array>;
  };
}
