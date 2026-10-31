export default {
  async fetch(request, env) {
    const url = new URL(request.url);

        async function sendEmail({ to, subject, html }) {
      if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
        throw new Error("Resend email settings are missing.");
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: env.MAIL_FROM,
          to,
          subject,
          html
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || "Resend failed to send the email."
        );
      }

      return data;
    }

        const SESSION_DAYS = 7;

    async function makeSignature(payload) {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.ADMIN_PASSWORD),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(payload)
      );

      return [...new Uint8Array(signature)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    }

    async function makeToken() {
      const exp = String(Date.now() + SESSION_DAYS * 86400000);
      const sig = await makeSignature(exp);
      return exp + "." + sig;
    }

    async function validToken(token) {
      if (!token || !token.includes(".")) return false;

      const [exp, sig] = token.split(".");

      if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) {
        return false;
      }

      const want = await makeSignature(exp);

      return sig === want;
    }

    async function requireAuth() {
      const cookie = request.headers.get("Cookie") || "";

      const match = cookie
        .split(";")
        .map(x => x.trim())
        .find(x => x.startsWith("mmy_admin="));

      if (!match) return false;

      const token = decodeURIComponent(match.slice("mmy_admin=".length));

      return await validToken(token);
    }

    function sessionCookie(token, maxAge) {
      return [
        "mmy_admin=" + encodeURIComponent(token),
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Max-Age=" + maxAge,
        "Secure"
      ].join("; ");
    }

        const FAQS = [
      {
        keywords: ["check in", "checkin", "check-in", "arrive", "arrival"],
        answer: "Check-in is from 2:00 PM. Let us know if you need to arrive earlier."
      },
      {
        keywords: ["check out", "checkout", "check-out"],
        answer: "Check-out is by 11:00 AM."
      },
      {
        keywords: ["pet", "dog", "cat"],
        answer: "We currently do not allow pets, with the exception of service animals."
      },
      {
        keywords: ["breakfast", "food", "meal"],
        answer: "Breakfast is included with every stay, served 8-10 AM."
      },
      {
        keywords: ["wifi", "wi-fi", "internet"],
        answer: "Yes, free WiFi is available throughout the property."
      },
      {
        keywords: ["parking", "car"],
        answer: "Free on-site parking is available for all guests."
      },
      {
        keywords: ["cancel", "refund"],
        answer: "Cancellations made 48 hours before check-in are fully refundable."
      },
      {
        keywords: ["price", "cost", "rate", "how much"],
        answer: "Rates vary by season and room type. Please check our Bookings page or contact us for exact pricing."
      },
      {
        keywords: ["availability", "available", "vacancy"],
        answer: "You can check availability directly on our Bookings page by selecting your dates."
      },
      {
        keywords: ["contact", "phone", "number", "reach"],
        answer: "You can reach us via the Contact page or the WhatsApp button on the site."
      }
    ];

    const FAQ_FALLBACK =
      "I'm not sure about that one. Please reach out through our Contact page or WhatsApp and we'll help directly!";

    if (url.pathname === "/api/test") {
      const result = await env.farmstay_db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all();

      return Response.json({
        ok: true,
        tables: result.results
      });
    }

    if (url.pathname === "/api/rooms") {
      const result = await env.farmstay_db
        .prepare(`
          SELECT
            id,
            name,
            capacity,
            minNights,
            maxNights,
            advanceDays,
            note,
            closed
          FROM rooms
          ORDER BY id
        `)
        .all();

      return Response.json(result.results);
    }

    if (url.pathname === "/api/reviews" && request.method === "GET") {
  const result = await env.farmstay_db
    .prepare(`
      SELECT id, name, stars, text, createdAt
      FROM reviews
      ORDER BY createdAt DESC
    `)
    .all();

  return Response.json(result.results);
}

    if (url.pathname === "/api/reviews" && request.method === "POST") {
  const body = await request.json();

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const stars = Number(body.stars);
  const text = String(body.text || "").trim();

  if (!name || !email || !text || !stars) {
    return Response.json(
      { error: "Name, email, rating and review are required." },
      { status: 400 }
    );
  }

  if (stars < 1 || stars > 5) {
    return Response.json(
      { error: "Rating must be between 1 and 5." },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.farmstay_db
    .prepare(`
      INSERT INTO reviews (
        id,
        name,
        email,
        stars,
        text,
        createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      name,
      email,
      stars,
      text,
      createdAt
    )
    .run();

  return Response.json({
    ok: true,
    id
  });
}
    
    if (url.pathname === "/api/contact" && request.method === "POST") {
  const body = await request.json();

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();

  if (!name || !email || !message) {
    return Response.json(
      { error: "Name, email and message are required." },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.farmstay_db
    .prepare(`
      INSERT INTO messages (
        id,
        name,
        email,
        phone,
        subject,
        message,
        done,
        createdAt
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `)
    .bind(
      id,
      name,
      email,
      phone,
      subject,
      message,
      createdAt
    )
    .run();

  return Response.json({
    ok: true,
    id
  });
}

    if (url.pathname === "/api/newsletter" && request.method === "POST") {
  const body = await request.json();

  const email = String(body.email || "").trim().toLowerCase();

  if (!email) {
    return Response.json(
      { error: "Email is required." },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    await env.farmstay_db
      .prepare(`
        INSERT INTO subscribers (
          id,
          email,
          createdAt
        )
        VALUES (?, ?, ?)
      `)
      .bind(id, email, createdAt)
      .run();
  } catch (error) {
    // Email already subscribed
    if (String(error).includes("UNIQUE")) {
      return Response.json({
        ok: true,
        message: "Already subscribed."
      });
    }

    throw error;
  }

  return Response.json({
    ok: true
  });
}

    if (url.pathname === "/api/availability") {
  const roomId = url.searchParams.get("roomId");

  if (!roomId) {
    return Response.json(
      { error: "roomId is required" },
      { status: 400 }
    );
  }

  const bookings = await env.farmstay_db
    .prepare(`
      SELECT checkIn, checkOut, status
      FROM bookings
      WHERE roomId = ?
      AND status = 'confirmed'
    `)
    .bind(roomId)
    .all();

  const blocks = await env.farmstay_db
    .prepare(`
      SELECT "from", "to", note
      FROM blocks
      WHERE roomId = ?
    `)
    .bind(roomId)
    .all();

  return Response.json({
    bookings: bookings.results,
    blocks: blocks.results
  });
}

    if (url.pathname === "/api/bookings" && request.method === "POST") {
  const body = await request.json();

  const {
    name,
    email,
    phone,
    guests,
    roomId,
    checkIn,
    checkOut,
    occasion = "",
    timeSlot = "",
    requests = "",
    note = ""
  } = body;

  if (!name || !email || !roomId || !checkIn || !checkOut) {
    return Response.json(
      { error: "Missing required booking information." },
      { status: 400 }
    );
  }

  const room = await env.farmstay_db
    .prepare("SELECT * FROM rooms WHERE id = ?")
    .bind(roomId)
    .first();

  if (!room) {
    return Response.json(
      { error: "Room not found." },
      { status: 404 }
    );
  }

  // Calculate number of nights.
  const start = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");
  const nights = Math.round(
    (end - start) / 86400000
  );

  if (nights <= 0) {
    return Response.json(
      { error: "Check-out must be after check-in." },
      { status: 400 }
    );
  }

  if (nights < room.minNights) {
    return Response.json(
      {
        error: `${room.name} requires at least ${room.minNights} night${room.minNights === 1 ? "" : "s"}.`
      },
      { status: 400 }
    );
  }

  if (nights > room.maxNights) {
    return Response.json(
      {
        error: `${room.name} allows a maximum of ${room.maxNights} nights.`
      },
      { status: 400 }
    );
  }

  // Check for overlapping confirmed bookings.
  const clash = await env.farmstay_db
    .prepare(`
      SELECT *
      FROM bookings
      WHERE roomId = ?
      AND status = 'confirmed'
      AND checkIn < ?
      AND checkOut > ?
      LIMIT 1
    `)
    .bind(roomId, checkOut, checkIn)
    .first();

  if (clash) {
    return Response.json(
      { error: "Those dates are already booked." },
      { status: 409 }
    );
  }

  const id = crypto.randomUUID();
  const ref = "MMY-" + Date.now();
  const createdAt = new Date().toISOString();

  await env.farmstay_db
    .prepare(`
      INSERT INTO bookings (
        id,
        ref,
        status,
        source,
        createdAt,
        name,
        email,
        phone,
        guests,
        roomId,
        checkIn,
        checkOut,
        nights,
        occasion,
        timeSlot,
        requests,
        note,
        confirmedAt
      )
      VALUES (?, ?, 'pending', 'website', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `)
    .bind(
      id,
      ref,
      createdAt,
      name,
      email,
      phone || "",
      Number(guests) || 0,
      roomId,
      checkIn,
      checkOut,
      nights,
      occasion,
      timeSlot,
      requests,
      note
    )
    .run();

          try {
    await sendEmail({
      to: env.ADMIN_EMAIL,
      subject: `New booking request — ${ref}`,
      html: `
        <h2>New Booking Request</h2>
        <p><strong>Reference:</strong> ${ref}</p>
        <p><strong>Guest:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
        <p><strong>Room:</strong> ${room.name}</p>
        <p><strong>Guests:</strong> ${Number(guests) || 0}</p>
        <p><strong>Check-in:</strong> ${checkIn}</p>
        <p><strong>Check-out:</strong> ${checkOut}</p>
        <p><strong>Nights:</strong> ${nights}</p>
        <p><strong>Occasion:</strong> ${occasion || "None"}</p>
        <p><strong>Time slot:</strong> ${timeSlot || "None"}</p>
        <p><strong>Requests:</strong> ${requests || "None"}</p>
        <p><strong>Note:</strong> ${note || "None"}</p>
      `
    });
  } catch (error) {
    console.error("Booking notification email failed:", error);
  }

  return Response.json({
    ok: true,
    id,
    ref,
    nights
  });
}

        if (url.pathname === "/api/admin/login" && request.method === "POST") {
      const body = await request.json();
      const password = String(body.password || "");

      if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
        return Response.json(
          { error: "That password is not right. Please try again." },
          { status: 401 }
        );
      }

      const token = await makeToken();

      return new Response(
        JSON.stringify({ ok: true }),
        {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": sessionCookie(token, SESSION_DAYS * 86400)
          }
        }
      );
    }
        if (url.pathname === "/api/admin/logout" && request.method === "POST") {
      return new Response(
        JSON.stringify({ ok: true }),
        {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": sessionCookie("", 0)
          }
        }
      );
    }

        if (url.pathname === "/api/admin/me" && request.method === "GET") {
      if (!(await requireAuth())) {
        return Response.json(
          { error: "Please log in." },
          { status: 401 }
        );
      }

      return Response.json({ ok: true });
    }


    if (url.pathname === "/api/admin/data" && request.method === "GET") {
  if (!(await requireAuth())) {
    return Response.json(
      { error: "Please log in." },
      { status: 401 }
    );
  }

  const [
    roomsResult,
    bookingsResult,
    blocksResult,
    reviewsResult,
    messagesResult,
    subscribersResult
  ] = await Promise.all([
    env.farmstay_db.prepare("SELECT * FROM rooms").all(),
    env.farmstay_db.prepare("SELECT * FROM bookings").all(),
    env.farmstay_db.prepare("SELECT * FROM blocks").all(),
    env.farmstay_db.prepare("SELECT * FROM reviews").all(),
    env.farmstay_db.prepare("SELECT * FROM messages").all(),
    env.farmstay_db.prepare("SELECT * FROM subscribers").all()
  ]);

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: env.TIMEZONE || "Asia/Kolkata"
  });

  const rooms = roomsResult.results.map(room => ({
    ...room,
    closed: JSON.parse(room.closed || "[]")
  }));

  const blocks = blocksResult.results
    .map(block => ({
      ...block,
      reason: block.note || ""
    }))
    .sort((a, b) => a.from.localeCompare(b.from));

  const bookings = bookingsResult.results
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const reviews = reviewsResult.results
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const messages = messagesResult.results
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const subscribers = subscribersResult.results
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return Response.json({
    today,
    rooms,
    bookings,
    blocks,
    reviews,
    messages,
    subscribers
  });
}

    if (url.pathname === "/api/admin/blocks" && request.method === "POST") {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const body = await request.json();

  const roomsResult = await env.farmstay_db
    .prepare("SELECT * FROM rooms")
    .all();

  const rooms = roomsResult.results;

  const targets =
    body.roomId === "all"
      ? rooms
      : rooms.filter(room => room.id === body.roomId);

  if (!targets.length) {
    return Response.json(
      { error: "Please choose a room." },
      { status: 400 }
    );
  }

  if (!body.from || !body.to) {
    return Response.json(
      { error: "Please choose both dates." },
      { status: 400 }
    );
  }

  if (body.to < body.from) {
    return Response.json(
      { error: "The last day must be the same as or after the first day." },
      { status: 400 }
    );
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: env.TIMEZONE || "Asia/Kolkata"
  });

  if (body.to < today) {
    return Response.json(
      { error: "These dates are already over." },
      { status: 400 }
    );
  }

  // Don't allow blocking dates that already contain a confirmed booking.
  for (const room of targets) {
    const clash = await env.farmstay_db
      .prepare(`
        SELECT ref, checkIn, checkOut
        FROM bookings
        WHERE roomId = ?
          AND status = 'confirmed'
          AND checkIn < ?
          AND checkOut > ?
        LIMIT 1
      `)
      .bind(room.id, body.to, body.from)
      .first();

    if (clash) {
      return Response.json(
        {
          error:
            room.name +
            " already has booking " +
            clash.ref +
            " in these dates."
        },
        { status: 409 }
      );
    }
  }

  const reason = String(body.reason || "").trim().slice(0, 80);
  const created = [];

  for (const room of targets) {
    const block = {
      id: crypto.randomUUID(),
      roomId: room.id,
      from: body.from,
      to: body.to,
      note: reason
    };

    await env.farmstay_db
      .prepare(`
        INSERT INTO blocks (id, roomId, "from", "to", note)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        block.id,
        block.roomId,
        block.from,
        block.to,
        block.note
      )
      .run();

    created.push({
      ...block,
      reason: block.note
    });
  }

  return Response.json(
    { ok: true, blocks: created },
    { status: 201 }
  );
}


if (
  url.pathname.startsWith("/api/admin/blocks/") &&
  request.method === "DELETE"
) {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const id = url.pathname.split("/").pop();

  const result = await env.farmstay_db
    .prepare("DELETE FROM blocks WHERE id = ?")
    .bind(id)
    .run();

  if (!result.meta.changes) {
    return Response.json(
      { error: "Block not found." },
      { status: 404 }
    );
  }

  return Response.json({ ok: true });
}


if (
  url.pathname.startsWith("/api/admin/reviews/") &&
  request.method === "DELETE"
) {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const id = url.pathname.split("/").pop();

  const result = await env.farmstay_db
    .prepare("DELETE FROM reviews WHERE id = ?")
    .bind(id)
    .run();

  if (!result.meta.changes) {
    return Response.json(
      { error: "Review not found." },
      { status: 404 }
    );
  }

  return Response.json({ ok: true });
}


if (
  url.pathname.startsWith("/api/admin/messages/") &&
  url.pathname.endsWith("/done") &&
  request.method === "POST"
) {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const parts = url.pathname.split("/");
  const id = parts[parts.length - 2];

  const body = await request.json();

  const done = body.done === false ? 0 : 1;

  const result = await env.farmstay_db
    .prepare("UPDATE messages SET done = ? WHERE id = ?")
    .bind(done, id)
    .run();

  if (!result.meta.changes) {
    return Response.json(
      { error: "Message not found." },
      { status: 404 }
    );
  }

  const message = await env.farmstay_db
    .prepare("SELECT * FROM messages WHERE id = ?")
    .bind(id)
    .first();

  return Response.json({
    ok: true,
    message
  });
}


if (
  url.pathname.startsWith("/api/admin/messages/") &&
  request.method === "DELETE"
) {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const id = url.pathname.split("/").pop();

  const result = await env.farmstay_db
    .prepare("DELETE FROM messages WHERE id = ?")
    .bind(id)
    .run();

  if (!result.meta.changes) {
    return Response.json(
      { error: "Message not found." },
      { status: 404 }
    );
  }

  return Response.json({ ok: true });
}


if (
  url.pathname.startsWith("/api/admin/subscribers/") &&
  request.method === "DELETE"
) {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const id = url.pathname.split("/").pop();

  const result = await env.farmstay_db
    .prepare("DELETE FROM subscribers WHERE id = ?")
    .bind(id)
    .run();

  if (!result.meta.changes) {
    return Response.json(
      { error: "Subscriber not found." },
      { status: 404 }
    );
  }

  return Response.json({ ok: true });
}

        if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await request.json();
      const message = String(body.message || "").trim();

      if (!message) {
        return Response.json(
          { error: "Please type a message." },
          { status: 400 }
        );
      }

      const text = message.toLowerCase();

      const hit = FAQS.find(faq =>
        faq.keywords.some(keyword => text.includes(keyword))
      );

      return Response.json({
        reply: hit ? hit.answer : FAQ_FALLBACK
      });
    }

    if (
  url.pathname.startsWith("/api/admin/bookings/") &&
  url.pathname.endsWith("/confirm") &&
  request.method === "POST"
) {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const parts = url.pathname.split("/");
  const id = parts[parts.length - 2];

  const booking = await env.farmstay_db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first();

  if (!booking) {
    return Response.json(
      { error: "Booking not found." },
      { status: 404 }
    );
  }

  if (booking.status === "confirmed") {
    return Response.json({ ok: true, booking });
  }

  if (booking.status !== "pending" && booking.status !== "declined") {
    return Response.json(
      { error: "This booking cannot be confirmed any more." },
      { status: 400 }
    );
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: env.TIMEZONE || "Asia/Kolkata"
  });

  if (booking.checkOut < today) {
    return Response.json(
      { error: "These dates are already over." },
      { status: 400 }
    );
  }

  const clash = await env.farmstay_db
    .prepare(`
      SELECT ref, name, checkIn, checkOut
      FROM bookings
      WHERE roomId = ?
        AND status = 'confirmed'
        AND id != ?
        AND checkIn < ?
        AND checkOut > ?
      LIMIT 1
    `)
    .bind(
      booking.roomId,
      booking.id,
      booking.checkOut,
      booking.checkIn
    )
    .first();

  if (clash) {
    return Response.json(
      {
        error:
          "These dates overlap with booking " +
          clash.ref +
          ". Decline this request, or cancel the other one first."
      },
      { status: 409 }
    );
  }

  const confirmedAt = new Date().toISOString();

  await env.farmstay_db
    .prepare(`
      UPDATE bookings
      SET status = 'confirmed',
          confirmedAt = ?
      WHERE id = ?
    `)
    .bind(confirmedAt, booking.id)
    .run();

          if (booking.email) {
    try {
      await sendEmail({
        to: booking.email,
        subject: `Booking confirmed — ${booking.ref}`,
        html: `
          <h2>Your booking is confirmed!</h2>
          <p>Hi ${booking.name},</p>
          <p>Your stay at Mar Me Yullong Farmstay has been confirmed.</p>

          <p><strong>Booking reference:</strong> ${booking.ref}</p>
          <p><strong>Room:</strong> ${booking.roomId}</p>
          <p><strong>Check-in:</strong> ${booking.checkIn}</p>
          <p><strong>Check-out:</strong> ${booking.checkOut}</p>
          <p><strong>Nights:</strong> ${booking.nights}</p>
          <p><strong>Guests:</strong> ${booking.guests}</p>

          <p>We look forward to welcoming you!</p>
        `
      });
    } catch (error) {
      console.error("Booking confirmation email failed:", error);
    }
  }

  const updated = await env.farmstay_db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(booking.id)
    .first();

  return Response.json({
    ok: true,
    booking: updated
  });
}


    if (
  url.pathname.startsWith("/api/admin/bookings/") &&
  url.pathname.endsWith("/decline") &&
  request.method === "POST"
) {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const parts = url.pathname.split("/");
  const id = parts[parts.length - 2];

  const booking = await env.farmstay_db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first();

  if (!booking) {
    return Response.json(
      { error: "Booking not found." },
      { status: 404 }
    );
  }

  if (booking.status !== "pending") {
    return Response.json(
      { error: "Only new requests can be declined." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const note = String(body.note || "").trim().slice(0, 300);

  await env.farmstay_db
    .prepare(`
      UPDATE bookings
      SET status = 'declined',
          note = ?
      WHERE id = ?
    `)
    .bind(note, booking.id)
    .run();

          if (booking.email) {
    try {
      await sendEmail({
        to: booking.email,
        subject: `Booking update — ${booking.ref}`,
        html: `
          <h2>Booking request update</h2>
          <p>Hi ${booking.name},</p>

          <p>Thank you for your booking request at Mar Me Yullong Farmstay.</p>

          <p>Unfortunately, we are unable to confirm your requested stay at this time.</p>

          <p><strong>Booking reference:</strong> ${booking.ref}</p>
          <p><strong>Room:</strong> ${booking.roomId}</p>
          <p><strong>Check-in:</strong> ${booking.checkIn}</p>
          <p><strong>Check-out:</strong> ${booking.checkOut}</p>

          <p>Please contact us if you would like to discuss alternative dates or arrangements.</p>
        `
      });
    } catch (error) {
      console.error("Booking decline email failed:", error);
    }
  }

  const updated = await env.farmstay_db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(booking.id)
    .first();

  return Response.json({
    ok: true,
    booking: updated
  });
}

    if (
  url.pathname.startsWith("/api/admin/bookings/") &&
  url.pathname.endsWith("/cancel") &&
  request.method === "POST"
) {
  if (!(await requireAuth())) {
    return Response.json({ error: "Please log in." }, { status: 401 });
  }

  const parts = url.pathname.split("/");
  const id = parts[parts.length - 2];

  const booking = await env.farmstay_db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first();

  if (!booking) {
    return Response.json(
      { error: "Booking not found." },
      { status: 404 }
    );
  }

  if (booking.status !== "confirmed") {
    return Response.json(
      { error: "Only confirmed bookings can be cancelled." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const note = String(body.note || "").trim().slice(0, 300);



    await env.farmstay_db
    .prepare(`
      UPDATE bookings
      SET status = 'cancelled',
          note = ?
      WHERE id = ?
    `)
    .bind(note, booking.id)
    .run();

  if (booking.email) {
    try {
      await sendEmail({
        to: booking.email,
        subject: `Booking cancelled — ${booking.ref}`,
        html: `
          <h2>Your booking has been cancelled</h2>
          <p>Hi ${booking.name},</p>

          <p>Your booking at Mar Me Yullong Farmstay has been cancelled.</p>

          <p><strong>Booking reference:</strong> ${booking.ref}</p>
          <p><strong>Room:</strong> ${booking.roomId}</p>
          <p><strong>Check-in:</strong> ${booking.checkIn}</p>
          <p><strong>Check-out:</strong> ${booking.checkOut}</p>
          <p><strong>Nights:</strong> ${booking.nights}</p>

          <p>If you have any questions, please contact us directly.</p>
        `
      });
    } catch (error) {
      console.error("Booking cancellation email failed:", error);
    }
  }

  const updated = await env.farmstay_db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(booking.id)
    .first();

  return Response.json({
    ok: true,
    booking: updated
  });
}

    if (
  url.pathname.startsWith("/api/admin/bookings/") &&
  request.method === "DELETE"
) {
  if (!(await requireAuth())) {
    return Response.json(
      { error: "Please log in." },
      { status: 401 }
    );
  }

  const id = url.pathname.split("/").pop();

  const booking = await env.farmstay_db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(id)
    .first();

  if (!booking) {
    return Response.json(
      { error: "Booking not found." },
      { status: 404 }
    );
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: env.TIMEZONE || "Asia/Kolkata"
  });

  const finished = booking.checkOut < today;

  if (booking.status === "confirmed" && !finished) {
    return Response.json(
      {
        error:
          "Cancel this booking first, then it can be removed."
      },
      { status: 400 }
    );
  }

  await env.farmstay_db
    .prepare("DELETE FROM bookings WHERE id = ?")
    .bind(id)
    .run();

  return Response.json({ ok: true });
}

    if (
  url.pathname === "/api/admin/bookings" &&
  request.method === "POST"
) {
  if (!(await requireAuth())) {
    return Response.json(
      { error: "Please log in." },
      { status: 401 }
    );
  }

  const body = await request.json();

  const room = await env.farmstay_db
    .prepare("SELECT * FROM rooms WHERE id = ?")
    .bind(body.roomId)
    .first();

  if (!room) {
    return Response.json(
      { error: "Please choose a room." },
      { status: 400 }
    );
  }

  const name = String(body.name || "").trim().slice(0, 80);

  if (name.length < 2) {
    return Response.json(
      { error: "Please enter the guest's name." },
      { status: 400 }
    );
  }

  const phone = String(body.phone || "").trim().slice(0, 30);

  if (phone.replace(/\D/g, "").length < 7) {
    return Response.json(
      { error: "Please enter the guest's phone number." },
      { status: 400 }
    );
  }

  const email = String(body.email || "").trim().toLowerCase().slice(0, 120);

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return Response.json(
      { error: "That email address does not look right." },
      { status: 400 }
    );
  }

  if (!body.checkIn || !body.checkOut) {
    return Response.json(
      { error: "Please choose both dates." },
      { status: 400 }
    );
  }

  if (body.checkOut < body.checkIn) {
    return Response.json(
      {
        error:
          "The last day must be the same as or after the first day."
      },
      { status: 400 }
    );
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: env.TIMEZONE || "Asia/Kolkata"
  });

  if (body.checkOut < today) {
    return Response.json(
      { error: "These dates are already over." },
      { status: 400 }
    );
  }

  // Check for an existing confirmed booking.
  const bookingClash = await env.farmstay_db
    .prepare(`
      SELECT ref, name
      FROM bookings
      WHERE roomId = ?
        AND status = 'confirmed'
        AND checkIn < ?
        AND checkOut > ?
      LIMIT 1
    `)
    .bind(
      room.id,
      body.checkOut,
      body.checkIn
    )
    .first();

  if (bookingClash) {
    return Response.json(
      {
        error:
          "These dates overlap with booking " +
          bookingClash.ref +
          "."
      },
      { status: 409 }
    );
  }

  // Check for blocked dates.
  const blockClash = await env.farmstay_db
    .prepare(`
      SELECT "from", "to", note
      FROM blocks
      WHERE roomId = ?
        AND "from" < ?
        AND "to" > ?
      LIMIT 1
    `)
    .bind(
      room.id,
      body.checkOut,
      body.checkIn
    )
    .first();

  if (blockClash) {
    return Response.json(
      {
        error:
          "These dates are blocked for " +
          room.name +
          "."
      },
      { status: 409 }
    );
  }

  // Calculate nights.
  const checkIn = new Date(body.checkIn + "T00:00:00Z");
  const checkOut = new Date(body.checkOut + "T00:00:00Z");

  const nights = Math.round(
    (checkOut - checkIn) / 86400000
  );

  if (nights < 1) {
    return Response.json(
      { error: "The stay must be at least one night." },
      { status: 400 }
    );
  }

  const ref = "MMY-" + Date.now();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const guests = Number(body.guests) || 0;

  const note = String(body.note || "")
    .trim()
    .slice(0, 300);

  const booking = {
    id,
    ref,
    status: "confirmed",
    source: "owner",
    createdAt: now,
    name,
    email,
    phone,
    guests,
    roomId: room.id,
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    nights,
    occasion: "",
    timeSlot: "",
    requests: "",
    note,
    confirmedAt: now
  };

  await env.farmstay_db
    .prepare(`
      INSERT INTO bookings (
        id, ref, status, source, createdAt,
        name, email, phone, guests, roomId,
        checkIn, checkOut, nights,
        occasion, timeSlot, requests, note, confirmedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      booking.id,
      booking.ref,
      booking.status,
      booking.source,
      booking.createdAt,
      booking.name,
      booking.email,
      booking.phone,
      booking.guests,
      booking.roomId,
      booking.checkIn,
      booking.checkOut,
      booking.nights,
      booking.occasion,
      booking.timeSlot,
      booking.requests,
      booking.note,
      booking.confirmedAt
    )
    .run();

  return Response.json(
    {
      ok: true,
      booking
    },
    { status: 201 }
  );
}
    return new Response("Mar Me Yullong Farmstay Worker is running.");
  }
};