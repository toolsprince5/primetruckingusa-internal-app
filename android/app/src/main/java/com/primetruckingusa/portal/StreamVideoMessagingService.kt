package com.primetruckingusa.portal

import android.annotation.SuppressLint
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import io.getstream.rn.callingx.StreamMessagingHelper

/**
 * Delivers Stream's incoming-call notifications before passing all ordinary
 * notifications back to Expo. This is the Android counterpart of the Stream
 * calling configuration in app.json.
 */
@SuppressLint("MissingFirebaseInstanceTokenRefresh")
class StreamVideoMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    if (StreamMessagingHelper.isStreamCallRing(remoteMessage)) {
      StreamMessagingHelper.handleMessage(applicationContext, remoteMessage)
      return
    }
    super.onMessageReceived(remoteMessage)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    StreamMessagingHelper.forwardNewToken(token)
  }
}
