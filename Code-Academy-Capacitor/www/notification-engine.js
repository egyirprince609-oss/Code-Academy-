/* =========================================================
   CODE ACADEMY
   CENTRAL NOTIFICATION ENGINE
   ---------------------------------------------------------
   Uses the SAME Firebase auth/database as authentication.js

   Collection:
      users/{uid}/notifications/{notificationId}

   This means notifications belong to the logged-in user.
========================================================= */

import {
    auth,
    db,
    onAuthStateChanged
} from "./authentication.js";

import {
    collection,
    addDoc,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    limit,
    updateDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


/* =========================================================
   GLOBAL
========================================================= */

let notificationUser = null;


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(auth, user => {
    notificationUser = user || null;

    if (user) {
        window.dispatchEvent(
            new CustomEvent("codeacademy-auth-ready", {
                detail: { user }
            })
        );
    }
});


/* =========================================================
   SAFE TEXT
========================================================= */

function cleanText(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();

}


/* =========================================================
   CREATE NOTIFICATION
========================================================= */

export async function sendNotification({
    title = "Code Academy",
    message = "",
    type = "info",
    icon = "🔔",
    link = "",
    uniqueKey = ""
} = {}) {

    const user = auth.currentUser;

    if (!user) {
        console.warn(
            "Notification skipped: no authenticated user."
        );
        return null;
    }

    message = cleanText(message);
    title = cleanText(title);

    if (!message) {
        return null;
    }


    /* -----------------------------------------------------
       OPTIONAL DUPLICATE PROTECTION
    ----------------------------------------------------- */

    if (uniqueKey) {

        const uniqueId =
            btoa(
                `${user.uid}_${uniqueKey}`
            )
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 80);

        const uniqueRef = doc(
            db,
            "users",
            user.uid,
            "notifications",
            `unique_${uniqueId}`
        );

        const existing =
            await getDoc(uniqueRef);

        if (existing.exists()) {
            return existing.id;
        }

        await setDoc(uniqueRef, {

            title,
            message,
            type,
            icon,
            link,

            read: false,

            uniqueKey,

            createdAt:
                serverTimestamp()

        });

        return uniqueRef.id;
    }


    /* -----------------------------------------------------
       NORMAL NOTIFICATION
    ----------------------------------------------------- */

    const notificationRef =
        await addDoc(
            collection(
                db,
                "users",
                user.uid,
                "notifications"
            ),
            {

                title,
                message,

                type,
                icon,

                link,

                read: false,

                createdAt:
                    serverTimestamp()

            }
        );


    /* Tell currently open pages */

    window.dispatchEvent(
        new CustomEvent(
            "codeacademy-notification",
            {
                detail: {
                    id: notificationRef.id,
                    title,
                    message,
                    type,
                    icon,
                    link
                }
            }
        )
    );


    return notificationRef.id;
}


/* =========================================================
   COURSE STARTED
========================================================= */

export async function notifyCourseStarted(
    courseId,
    courseName
) {

    return sendNotification({

        title: "Course Started 🚀",

        message:
            `You have started ${courseName}. Keep going — your coding journey has begun!`,

        type: "course",

        icon: "🚀",

        link:
            `course.html?course=${encodeURIComponent(courseId)}`,

        uniqueKey:
            `course_started_${courseId}_${new Date().toISOString().slice(0,10)}`

    });

}


/* =========================================================
   LESSON STARTED
========================================================= */

export async function notifyLessonStarted(
    courseId,
    courseName,
    lessonNumber
) {

    return sendNotification({

        title: "Lesson Started 📚",

        message:
            `${courseName} Lesson ${lessonNumber} has started. Learn at your own pace and finish strong!`,

        type: "lesson",

        icon: "📚",

        link:
            `lesson.html?course=${encodeURIComponent(courseId)}&lesson=${lessonNumber}`

    });

}


/* =========================================================
   LESSON COMPLETED
========================================================= */

export async function notifyLessonCompleted(
    courseId,
    courseName,
    lessonNumber,
    xp = 0
) {

    return sendNotification({

        title: "Lesson Completed 🎉",

        message:
            `Great job! You completed ${courseName} Lesson ${lessonNumber}${xp ? ` and earned ${xp} XP.` : "."}`,

        type: "success",

        icon: "🎉",

        link:
            `course.html?course=${encodeURIComponent(courseId)}`,

        uniqueKey:
            `lesson_completed_${courseId}_${lessonNumber}`

    });

}


/* =========================================================
   HALF COURSE
========================================================= */

export async function notifyHalfway(
    courseId,
    courseName
) {

    return sendNotification({

        title: "You're Halfway There! 🔥",

        message:
            `Amazing work! You are halfway through ${courseName}. Don't stop now — you're doing great!`,

        type: "milestone",

        icon: "🔥",

        link:
            `course.html?course=${encodeURIComponent(courseId)}`,

        uniqueKey:
            `halfway_${courseId}`

    });

}


/* =========================================================
   ALMOST FINISHED
========================================================= */

export async function notifyAlmostFinished(
    courseId,
    courseName,
    completed,
    total
) {

    return sendNotification({

        title: "Almost There! 💪",

        message:
            `You have completed ${completed} of ${total} ${courseName} lessons. Just a little more and you'll unlock your certificate!`,

        type: "milestone",

        icon: "💪",

        link:
            `course.html?course=${encodeURIComponent(courseId)}`,

        uniqueKey:
            `almost_${courseId}_${completed}`

    });

}


/* =========================================================
   COURSE COMPLETED
========================================================= */

export async function notifyCourseCompleted(
    courseId,
    courseName
) {

    return sendNotification({

        title: "Course Completed! 🏆",

        message:
            `Congratulations! You completed every lesson in ${courseName}. Your certificate is now available.`,

        type: "certificate",

        icon: "🏆",

        link:
            `certificate.html?course=${encodeURIComponent(courseId)}`,

        uniqueKey:
            `course_completed_${courseId}`

    });

}


/* =========================================================
   CERTIFICATE AVAILABLE
========================================================= */

export async function notifyCertificateAvailable(
    courseId,
    courseName
) {

    return sendNotification({

        title: "Certificate Unlocked 🏅",

        message:
            `Your ${courseName} certificate is now available because you completed the entire course.`,

        type: "certificate",

        icon: "🏅",

        link:
            `certificate.html?course=${encodeURIComponent(courseId)}`,

        uniqueKey:
            `certificate_available_${courseId}`

    });

}


/* =========================================================
   CERTIFICATE VIEWED
========================================================= */

export async function notifyCertificateViewed(
    courseName
) {

    return sendNotification({

        title: "Certificate Viewed 🎓",

        message:
            `You opened your ${courseName} certificate. Keep building your skills!`,

        type: "certificate",

        icon: "🎓"

    });

}


/* =========================================================
   XP EARNED
========================================================= */

export async function notifyXPEarned(
    amount,
    reason = "learning"
) {

    return sendNotification({

        title: "XP Earned ⚡",

        message:
            `You earned ${amount} XP from ${reason}. Keep it up!`,

        type: "xp",

        icon: "⚡"

    });

}


/* =========================================================
   XP EMPTY
========================================================= */

export async function notifyXPEmpty() {

    return sendNotification({

        title: "You're Out of XP ⚠️",

        message:
            "Your XP balance has reached 0. Keep learning and completing activities to earn more XP.",

        type: "warning",

        icon: "⚠️",

        uniqueKey:
            "xp_empty"

    });

}


/* =========================================================
   COINS EARNED
========================================================= */

export async function notifyCoinsEarned(
    amount,
    reason = "learning"
) {

    return sendNotification({

        title: "Coins Earned 🪙",

        message:
            `You earned ${amount} coins from ${reason}.`,

        type: "coins",

        icon: "🪙"

    });

}


/* =========================================================
   COINS EMPTY
========================================================= */

export async function notifyCoinsEmpty() {

    return sendNotification({

        title: "You're Out of Coins 🪙",

        message:
            "Your coin balance has reached 0. Complete activities and achievements to earn more coins.",

        type: "warning",

        icon: "🪙",

        uniqueKey:
            "coins_empty"

    });

}


/* =========================================================
   REFERRAL
========================================================= */

export async function notifyReferralJoined(
    friendName = "A new learner"
) {

    return sendNotification({

        title: "New Referral! 🎁",

        message:
            `${friendName} joined Code Academy using your referral code. Your referral reward has been recorded.`,

        type: "referral",

        icon: "🎁"

    });

}


/* =========================================================
   FRIEND REWARD
========================================================= */

export async function notifyReferralReward(
    xp = 100,
    coins = 10
) {

    return sendNotification({

        title: "Referral Reward Received! 🎁",

        message:
            `Someone joined using your referral code. You received ${xp} XP and ${coins} coins.`,

        type: "referral",

        icon: "🎁"

    });

}


/* =========================================================
   GENERIC ACTION
========================================================= */

export async function notifyAction(
    title,
    message,
    type = "info",
    icon = "🔔"
) {

    return sendNotification({

        title,
        message,
        type,
        icon

    });

}


/* =========================================================
   READ NOTIFICATIONS
========================================================= */

export async function getNotifications(
    maxItems = 50
) {

    const user = auth.currentUser;

    if (!user) {
        return [];
    }

    const notificationQuery =
        query(

            collection(
                db,
                "users",
                user.uid,
                "notifications"
            ),

            orderBy(
                "createdAt",
                "desc"
            ),

            limit(maxItems)

        );


    const snapshot =
        await getDocs(notificationQuery);


    return snapshot.docs.map(
        item => ({
            id: item.id,
            ...item.data()
        })
    );

}


/* =========================================================
   UNREAD COUNT
========================================================= */

export async function getUnreadCount() {

    const notifications =
        await getNotifications(100);


    return notifications.filter(
        notification =>
            notification.read !== true
    ).length;

}


/* =========================================================
   MARK ONE AS READ
========================================================= */

export async function markNotificationRead(
    notificationId
) {

    const user = auth.currentUser;

    if (!user || !notificationId) {
        return;
    }

    await updateDoc(

        doc(
            db,
            "users",
            user.uid,
            "notifications",
            notificationId
        ),

        {
            read: true,
            readAt: serverTimestamp()
        }

    );

}


/* =========================================================
   MARK ALL AS READ
========================================================= */

export async function markAllNotificationsRead() {

    const user = auth.currentUser;

    if (!user) {
        return;
    }

    const notifications =
        await getNotifications(100);


    const unread =
        notifications.filter(
            n => n.read !== true
        );


    await Promise.all(

        unread.map(
            n =>
                markNotificationRead(n.id)
        )

    );

}


/* =========================================================
   CHECK BALANCES
========================================================= */

export async function checkUserBalances() {

    const user = auth.currentUser;

    if (!user) {
        return;
    }


    const userRef =
        doc(db, "users", user.uid);

    const snapshot =
        await getDoc(userRef);


    if (!snapshot.exists()) {
        return;
    }


    const data =
        snapshot.data();


    const xp =
        Number(data.xp || 0);

    const coins =
        Number(data.coins || 0);


    if (xp <= 0) {
        await notifyXPEmpty();
    }


    if (coins <= 0) {
        await notifyCoinsEmpty();
    }

}


/* =========================================================
   COURSE MILESTONE CHECKER
========================================================= */

export async function checkCourseMilestones(
    courseId,
    courseName,
    completed,
    total
) {

    completed =
        Number(completed || 0);

    total =
        Number(total || 0);


    if (!total) {
        return;
    }


    const percentage =
        (completed / total) * 100;


    /* 50% */

    if (percentage >= 50) {

        await notifyHalfway(
            courseId,
            courseName
        );

    }


    /* 80% */

    if (
        percentage >= 80 &&
        percentage < 100
    ) {

        await notifyAlmostFinished(
            courseId,
            courseName,
            completed,
            total
        );

    }


    /* 100% */

    if (completed >= total) {

        await notifyCourseCompleted(
            courseId,
            courseName
        );

        await notifyCertificateAvailable(
            courseId,
            courseName
        );

    }

}


/* =========================================================
   EXPORT CURRENT USER
========================================================= */

export function getNotificationUser() {

    return auth.currentUser;

}
