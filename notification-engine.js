/* =========================================================
   CODE ACADEMY NOTIFICATION ENGINE
   Uses the SAME Firebase account/database as authentication.js
========================================================= */

import {
    auth,
    db
} from "./authentication.js";


import {
    collection,
    doc,
    addDoc,
    updateDoc,
    getDoc,
    getDocs,
    query,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


/* =========================================================
   CREATE NOTIFICATION
========================================================= */

export async function createNotification({

    uid = null,

    type = "system",

    title = "Code Academy",

    message = "",

    link = null,

    data = {}

} = {}){


    const targetUid =
        uid ||
        auth.currentUser?.uid;


    if(!targetUid){

        console.warn(
            "Notification skipped: no authenticated user."
        );

        return null;

    }


    if(!message){

        console.warn(
            "Notification skipped: message is empty."
        );

        return null;

    }


    try{

        const notificationsRef =
            collection(
                db,
                "users",
                targetUid,
                "notifications"
            );


        const notification =
            {

                type,

                title,

                message,

                link,

                read:false,

                createdAt:
                    serverTimestamp(),

                ...data

            };


        const created =
            await addDoc(
                notificationsRef,
                notification
            );


        return created.id;

    }catch(error){

        console.error(
            "Notification creation failed:",
            error
        );

        return null;

    }

}


/* =========================================================
   LESSON STARTED
========================================================= */

export async function notifyLessonStarted(
    lessonName = "a lesson"
){

    return createNotification({

        type:"lesson_start",

        title:"Lesson Started",

        message:
            `You started "${lessonName}". Keep learning!`,

        link:"course.html"

    });

}


/* =========================================================
   LESSON STOPPED / PAUSED
========================================================= */

export async function notifyLessonStopped(
    lessonName = "a lesson"
){

    return createNotification({

        type:"lesson_stop",

        title:"Lesson Paused",

        message:
            `You paused "${lessonName}". You can continue anytime.`,

        link:"course.html"

    });

}


/* =========================================================
   LESSON COMPLETED
========================================================= */

export async function notifyLessonCompleted(
    lessonName = "a lesson",
    xpEarned = 0
){

    const xpText =
        Number(xpEarned) > 0
        ? ` You earned ${xpEarned} XP.`
        : "";


    return createNotification({

        type:"lesson_complete",

        title:"Lesson Completed 🎉",

        message:
            `Great job! You completed "${lessonName}".${xpText}`,

        link:"progress.html"

    });

}


/* =========================================================
   CERTIFICATE EARNED
========================================================= */

export async function notifyCertificateEarned(
    courseName = "a course"
){

    return createNotification({

        type:"certificate",

        title:"Certificate Earned 🏆",

        message:
            `Congratulations! You earned a certificate for "${courseName}".`,

        link:"certificate.html"

    });

}


/* =========================================================
   REFERRAL SUCCESS
========================================================= */

export async function notifyReferralJoined(
    friendName = "A new learner"
){

    return createNotification({

        type:"referral",

        title:"New Referral 🎉",

        message:
            `${friendName} joined Code Academy using your referral code. Your referral reward has been added.`,

        link:"community.html"

    });

}


/* =========================================================
   XP EARNED
========================================================= */

export async function notifyXPEarned(
    amount = 0,
    reason = "learning"
){

    return createNotification({

        type:"xp",

        title:"XP Earned ⭐",

        message:
            `You earned ${amount} XP from ${reason}.`,

        link:"progress.html"

    });

}


/* =========================================================
   COINS EARNED
========================================================= */

export async function notifyCoinsEarned(
    amount = 0,
    reason = "learning"
){

    return createNotification({

        type:"coins",

        title:"Coins Earned 🪙",

        message:
            `You earned ${amount} coins from ${reason}.`,

        link:"progress.html"

    });

}


/* =========================================================
   XP EMPTY
========================================================= */

export async function notifyXPEmpty(){

    return createNotification({

        type:"xp_empty",

        title:"You're Out of XP",

        message:
            "You have run out of XP. Complete lessons, exercises and activities to earn more.",

        link:"course.html"

    });

}


/* =========================================================
   COINS EMPTY
========================================================= */

export async function notifyCoinsEmpty(){

    return createNotification({

        type:"coins_empty",

        title:"You're Out of Coins",

        message:
            "You have run out of coins. Complete activities and earn more coins.",

        link:"progress.html"

    });

}


/* =========================================================
   GENERAL SYSTEM NOTIFICATION
========================================================= */

export async function notifySystem(
    title,
    message,
    link = null
){

    return createNotification({

        type:"system",

        title,

        message,

        link

    });

}


/* =========================================================
   GET CURRENT USER
========================================================= */

export function getCurrentNotificationUser(){

    return auth.currentUser || null;

}
